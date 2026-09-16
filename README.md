# agy-open: CLI Tool to Open Directories in Antigravity App

> **开发交接与架构备忘文档**  
> 本文档详尽记录了针对 Google Antigravity 2.0 桌面端应用的底层逆向调研、技术原理、方案对比以及后续开发的完整实现规范，供后续开发者与 AI Agent 直接接手开发。

---

## 1. 背景与核心诉求 (Problem Statement)

在使用 Google Antigravity 时，开发者在终端工作流中存在一个明显的痛点：
- 在日常开发中，我们经常在终端中通过 `cd` 进入某个项目目录。在 OpenAI Codex 中，开发者可以通过 `codex app .` 直接在桌面端唤起当前项目；在 VS Code / Cursor 中有 `code .` 或 `cursor .`。
- **但是，Antigravity 官方目前并没有提供任何类似 `agy app .` 或终端唤起桌面端打开当前文件夹的命令。** 开发者必须手动打开 Antigravity 桌面应用，点击新建对话或打开项目，然后在 macOS Finder 弹窗中逐层寻找目录，交互非常繁琐。

---

## 2. 方案形态选型：独立命令 vs 劫持 Wrapper

在前期探讨中，明确了**采用独立的 CLI 命令 `agy-open`（而非劫持包装原版 `agy` 指令）**：

| 方案对比 | 劫持包装 `agy app .` | 独立命令 `agy-open .` (推荐采纳) |
| :--- | :--- | :--- |
| **实现方式** | 在 Shell 中定义 `agy()` 包装函数或在 PATH 中劫持原版 `agy` 二进制 | 独立可执行脚本/命令 `agy-open [path]` |
| **侵入性** | **高侵入**：容易干扰原版 `agy` 的正常执行与更新 | **零侵入**：与原版 `agy` 完全解耦，各司其职 |
| **稳定性风险** | 当官方 `agy` 升级、调用子进程、或使用复杂的标准输入流（NDJSON/pipe）时，容易引发参数解析丢失或兼容崩溃 | 无论官方 `agy` 如何更新升级，完全互不影响 |
| **用户体验** | 形式上更像 `codex app .` | 类似 `code .`、`cursor .`、`subl .`，更符合主流开发工具惯例；若用户偏好 `agy app`，可自行在 `.zshrc` 中配一行 alias |

---

## 3. Antigravity 桌面端底层机制逆向总结

经过对 macOS 上 `/Applications/Antigravity.app` 的结构、主进程、后端服务和前端包的深入解构，核心机制如下：

### 3.1 客户端核心构成
- **主程序位置**：`/Applications/Antigravity.app`
- **Electron 主进程**：`/Applications/Antigravity.app/Contents/MacOS/Antigravity`
- **Asar 资源包**：`/Applications/Antigravity.app/Contents/Resources/app.asar`
- **后端二进制**：`/Applications/Antigravity.app/Contents/Resources/bin/language_server`
  - 启动参数包含 `--standalone`, `--subclient_type hub`, `--https_server_port 0`。
  - 在本地启动 HTTPS (gRPC) 和 HTTP 服务（例如 `https://127.0.0.1:<random_port>/`），提供 Web 前端服务与 RPC 接口。

### 3.2 项目注册机制 (`projects`)
- **存储路径**：`~/.gemini/config/projects/<project-id>.json`
- **配置结构**：每个项目由一个 UUID 命名，JSON 内容如下：
  ```json
  {
    "id": "36b37401-c9fa-44ea-8b01-fa664dfe70ce",
    "name": "agy-open",
    "projectResources": {
      "resources": [
        {
          "folderUri": "file:///Users/wuyuetian/Documents/Developer/projects/agy-open"
        }
      ]
    },
    "settings": {},
    "isWorkspaceOnly": false
  }
  ```
- **实时同步机制**：Antigravity 后端 `language_server` 在启动时就常驻启动了项目监听器（内部报错日志印证为 `projects watcher`）。只要往 `~/.gemini/config/projects/` 新增或修改 `.json` 文件，后端会立刻感知并同步。

### 3.3 本地状态存储 (`app_storage.json`)
- **文件路径**：`~/Library/Application Support/Antigravity/app_storage.json`
- **关键字段**：
  - `"new-convo-last-selected-project"`: 记录当前界面或新建会话时默认选中的 `projectId`。
  - `"lastCreatedProjectId"`: 记录最近创建的项目 ID。

### 3.4 运行时通信接口 (CDP & DevToolsActivePort)
- Antigravity 启动时默认开启了 Chromium 远程调试端口：
  - 文件路径：`~/Library/Application Support/Antigravity/DevToolsActivePort`
  - 内容格式：
    - Line 1: 本地 CDP 调试端口号（例如 `61686`）
    - Line 2: 浏览器调试路径（例如 `/devtools/browser/...`）
- 访问 `http://127.0.0.1:<port>/json` 可以直接获取所有活动页面，包括主页面：
  ```json
  {
    "id": "...",
    "title": "...",
    "type": "page",
    "url": "https://127.0.0.1:<ls_port>/...",
    "webSocketDebuggerUrl": "ws://127.0.0.1:<port>/devtools/page/<id>"
  }
  ```
- **已实测验证**：通过 Node.js 原生 `WebSocket` 连接至 `webSocketDebuggerUrl`，可通过 CDP 发送 `Runtime.evaluate` 或 `Page.navigate`，在毫秒级内完成前台页面的路由跳转或上下文切换。

---

## 4. `agy-open` 详细执行流程与技术方案

### 4.1 技术栈要求
- **运行时**：Node.js (TypeScript 编写，编译生成干净的 `dist/cli.js`)
- **依赖控制**：**0 外部运行时依赖 (Zero Dependencies)**。
  - Node.js 22+ 已经内置原生 `WebSocket`。
  - 核心逻辑仅使用内置模块：`node:fs`, `node:path`, `node:crypto`, `node:http`, `node:child_process`。
  - 启动执行时间控制在 20ms 以内，无任何拉取大型依赖的开销。

### 4.2 整体执行流程
当用户在命令行执行 `agy-open [targetPath]` 时（`targetPath` 默认为 `.`）：

```
[ 用户执行 agy-open [path] ]
             │
             ▼
[ 解析绝对路径 file:///... ]
             │
             ▼
[ 扫描 ~/.gemini/config/projects/*.json ]
             │
      ┌──────┴──────┐
      ▼             ▼
[ 存在匹配项目 ]   [ 不存在匹配项目 ]
   获取已有 id       生成 UUID 并写入 <uuid>.json
      │             │
      └──────┬──────┘
             ▼
[ 更新 app_storage.json 中的 new-convo-last-selected-project ]
             │
             ▼
[ 检测 Antigravity 是否在运行? ]
      ┌──────┴──────┐
      ▼             ▼
  (未运行)       (已运行)
      │             │
      │       [ 读取 DevToolsActivePort 获取 CDP 端口 ]
      │             │
      │       [ 通过 WebSocket CDP 通知页面跳转 /?section=<id> ]
      │             │
      └──────┬──────┘
             ▼
[ 调用 open -a Antigravity 唤起并置顶窗口 ]
```

#### 详细步骤说明：
1. **Path Resolution & Validation**：
   - 将输入路径解析为绝对文件系统路径 `targetDir = path.resolve(process.cwd(), targetPath)`。
   - 检查目标路径是否存在且为一个目录。
   - 生成对应的 URI：`file://${targetDir}`。
   - 提取目录名称作为项目默认名：`path.basename(targetDir)`。

2. **Project Registry**：
   - 遍历 `~/.gemini/config/projects/*.json`。
   - 若某 JSON 文件的 `projectResources.resources[].folderUri === targetUri`，直接获取该文件的 `id`。
   - 若未匹配到，则使用 `crypto.randomUUID()` 生成新的 `projectId`，并写入标准结构的 `~/.gemini/config/projects/${projectId}.json`。
   - 读取并更新 `~/Library/Application Support/Antigravity/app_storage.json`，设置：
     ```json
     {
       "new-convo-last-selected-project": "<projectId>",
       "lastCreatedProjectId": "<projectId>"
     }
     ```

3. **App 激活与状态联动**：
   - **检查运行状态**：检查进程或检查 `~/Library/Application Support/Antigravity/DevToolsActivePort` 是否有效。
   - **情景 A（未运行）**：
     - 直接执行 `child_process.exec('open -a Antigravity')`（或优先探测 `/Applications/Antigravity.app`）。
     - Antigravity 启动后初始化读取 `app_storage.json`，即会自动载入该项目。
   - **情景 B（已运行）**：
     - 读取 `DevToolsActivePort` 第一行的端口。
     - 发送 HTTP GET 到 `http://127.0.0.1:${port}/json` 获取 target 列表。
     - 找到 `type === 'page'` 且 url 包含 `127.0.0.1` 的主页面目标。
     - 建立原生 `WebSocket` 连接至 `webSocketDebuggerUrl`。
     - 发送 `Runtime.evaluate` 指令，执行页面路由切换（例如将当前窗口导航至 `/?section=${projectId}` 启动新对话或定位该项目）。
     - 执行 `open -a Antigravity`，通知 macOS 窗口管理器将 Antigravity 置顶并获得焦点。

---

## 5. 验证过的 PoC 代码片段

以下为前期调研时实际执行通过的 Node.js 原型测试脚本，证实机制 100% 可用：

### 5.1 CDP 页面发现测试
```javascript
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const portFile = path.join(os.homedir(), 'Library/Application Support/Antigravity/DevToolsActivePort');
const [port] = fs.readFileSync(portFile, 'utf-8').trim().split('\n');

http.get(`http://127.0.0.1:${port}/json`, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const list = JSON.parse(data);
    const mainPage = list.find(p => p.type === 'page' && p.url.startsWith('https://127.0.0.1:'));
    console.log('Main page target:', mainPage);
  });
});
```

### 5.2 CDP 原生 WebSocket 交互测试
```javascript
const ws = new WebSocket(mainPage.webSocketDebuggerUrl);
ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `window.location.search` // 或设置 window.location.href = '/?section=' + projectId
    }
  }));
};
ws.onmessage = (msg) => {
  console.log('CDP Result:', JSON.parse(msg.data));
  ws.close();
};
```

---

## 6. 建议的项目工程结构

接手的 AI Agent 可按以下结构初始化与实现该工程：

```text
agy-open/
├── README.md               # 项目主文档与接手说明（即本文档）
├── package.json            # 配置 bin: { "agy-open": "./dist/cli.js" }, scripts: build, test 等
├── tsconfig.json           # 现代 TypeScript 配置 (target: ES2022 / NodeNext)
├── src/
│   ├── cli.ts              # 命令行入口，参数处理 (支持 --help, --version, [path])
│   ├── project.ts          # 项目查找与 ~/.gemini/config/projects 注册逻辑
│   ├── storage.ts          # app_storage.json 的读取与更新
│   ├── cdp.ts              # DevToolsActivePort 读取与原生 WebSocket CDP 控制
│   └── app.ts              # open -a Antigravity 唤起与平台兼容
└── dist/                   # 编译后构建产物 (单文件或轻量 bundle)
```

---

## 7. 预期使用效果

安装后（例如 `npm link` 或 `npm install -g agy-open`）：
```bash
# 1. 打开当前目录
cd /Users/wuyuetian/Documents/Developer/projects/my-web-app
agy-open .

# 2. 打开指定目录
agy-open ~/Documents/Developer/projects/another-project

# 3. (可选) 用户若想使用 agy app .，只需在 ~/.zshrc 增加如下 alias：
alias "agy app"="agy-open"
```
终端执行后，Antigravity 桌面端将秒级唤起并聚焦到当前项目，无需任何多余点击！
