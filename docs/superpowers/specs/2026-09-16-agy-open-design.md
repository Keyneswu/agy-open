# agy-open design

Date: 2026-09-16  
Status: approved for implementation planning  
Scope: macOS CLI that opens a folder as an Antigravity project and starts a new conversation

## 1. Problem

Antigravity has no official equivalent of `code .` / `cursor .` / `codex app .`. Developers already `cd` into a project in the terminal, then must hunt for that folder in the Antigravity UI.

`agy-open [path]` must:

1. Register the directory as an Antigravity project (reuse the existing project if one already points at that folder).
2. Bring the Antigravity window to the front.
3. Open a **new conversation** for that project.

## 2. Non-goals (v1)

- Wrapping or hijacking the official `agy` binary.
- Windows or Linux.
- Publishing to npm or Homebrew.
- GitHub Actions / CI.
- Opening an existing conversation instead of a new one.
- Any runtime npm dependencies.

## 3. Users and install

The repo is public-ready source on GitHub. Distribution in v1 is clone-and-install, not a registry package.

```bash
git clone <repo>
cd agy-open
pnpm install
pnpm build
pnpm add -g .
```

`pnpm add -g .` is the current official way to register a local package's `bin` globally. `pnpm link --global` was removed in pnpm v11. Source: [pnpm link](https://pnpm.io/cli/link).

Requirements for users: macOS, Node.js 22+, pnpm, Antigravity installed at `/Applications/Antigravity.app`.

License: MIT.

## 4. Architecture

One Node.js CLI. TypeScript compiles to `dist/cli.js`. Zero runtime dependencies: only Node built-ins (`node:fs`, `node:path`, `node:os`, `node:http`, `node:crypto`, `node:child_process`, plus the built-in `WebSocket` in Node 22+).

`package.json` exposes:

```json
{
  "name": "agy-open",
  "bin": {
    "agy-open": "./dist/cli.js"
  }
}
```

The compiled entry file starts with `#!/usr/bin/env node` so the global symlink is executable. Source: [npm `bin`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin), [Node shebang](https://nodejs.org/learn/command-line/run-nodejs-scripts-from-the-command-line).

### 4.1 Modules

| File | Responsibility | Depends on |
|---|---|---|
| `src/cli.ts` | Parse `process.argv` (`[path]`, `--help`, `--version`). Orchestrate the flow. Print errors to stderr. Set exit codes. | the four modules below |
| `src/project.ts` | Find or create `~/.gemini/config/projects/<id>.json` by `folderUri`. Paths are injected (not hardcoded) so tests can use a temp dir. | filesystem only |
| `src/storage.ts` | Update `new-convo-last-selected-project` and `lastCreatedProjectId` in `app_storage.json`. Preserve every other key. Paths injected. | filesystem only |
| `src/cdp.ts` | Read `DevToolsActivePort`, `GET /json`, pick the main page, send CDP to open a new conversation for `projectId`. | loopback HTTP + WebSocket |
| `src/app.ts` | Detect `/Applications/Antigravity.app`. Run `open -a Antigravity` to launch or focus. | `node:child_process`, `node:fs` |

CLI usage:

```text
agy-open [path]
agy-open --help
agy-open --version
```

`path` defaults to `.`. Unknown flags are a usage error. `--help` / `--version` exit 0 and print English text to stdout.

Skip project JSON files that have no `projectResources.resources[].folderUri` (observed on this machine: `default-cli-project.json`, `outside-of-project.json`).

## 5. Data flow

Shared steps, then a running/not-running branch.

### 5.1 Shared

1. Refuse non-darwin (`process.platform !== "darwin"`).
2. Resolve `targetDir = path.resolve(process.cwd(), pathArg)`. It must exist and be a directory.
3. Build `folderUri` as a `file://` URL. Encode the path so spaces and other special characters are valid (use `pathToFileURL` from `node:url`).
4. `ensureProject(projectsDir, folderUri, name)`:
   - Normalize `folderUri` by stripping a trailing `/` except for `file:///`.
   - Scan `*.json`.
   - If any file's resources contain this `folderUri` (compare after the same normalization), return that `id`.
   - Otherwise create `{id, name, projectResources, settings: {}, isWorkspaceOnly: false}` with `id = crypto.randomUUID()` and `name = path.basename(targetDir)`. Write atomically.
   - If `projectsDir` does not exist, create it.
5. `updateStorage(storagePath, projectId)`:
   - File must already exist (Antigravity has been opened at least once).
   - Parse JSON object. Set the two fields. Write atomically (write temp file in the same directory, then `rename`).

Project JSON shape (matches files already in `~/.gemini/config/projects/`):

```json
{
  "id": "<uuid>",
  "name": "<basename>",
  "projectResources": {
    "resources": [{ "folderUri": "file:///absolute/path" }]
  },
  "settings": {},
  "isWorkspaceOnly": false
}
```

### 5.2 App not running

Detected when `DevToolsActivePort` is missing, unreadable, or `GET http://127.0.0.1:<port>/json` fails.

1. `open -a Antigravity`.
2. Poll CDP until a main page target exists. Timeout: **30 seconds**. Interval: 200ms.
3. Send the new-conversation CDP command (section 6).
4. `open -a Antigravity` again to focus.

Write project + storage **before** launch so a cold start reads the updated files.

### 5.3 App already running

1. Read port from the first line of `~/Library/Application Support/Antigravity/DevToolsActivePort`.
2. `GET /json`. Pick the target where `type === "page"` and `url` starts with `https://127.0.0.1:`. If several match, use the first.
3. Connect to `webSocketDebuggerUrl` with the built-in `WebSocket`.
4. Send the new-conversation CDP command (section 6).
5. `open -a Antigravity` to focus.

If the project JSON was just created, the in-process projects watcher may need a moment. Retry the CDP command up to 3 times over ~1 second if the first evaluate/navigate fails.

### 5.4 Success output

Exit 0. One line on stdout, English, e.g. `Opened new conversation for /abs/path (project <id>)`.

## 6. Opening a new conversation (CDP)

Success criterion (not a guessed URL): after the command returns, the Antigravity main window is focused and the UI is on a **new conversation** whose selected project is `projectId`.

Research candidate from the handoff README: navigate to `/?section=<projectId>` via `Runtime.evaluate` or `Page.navigate`. That candidate is **not** accepted as fact. During implementation, run a short live probe against the installed Antigravity 2.0:

1. With the app running, use CDP `Runtime.evaluate` to read `window.location.href` on the main page.
2. In the UI, manually start a new conversation for a known project and record the resulting URL and any obvious in-page API.
3. Replay that navigation/evaluate from CDP and confirm a new conversation opens (not merely project selection).
4. Encode the winning expression in `src/cdp.ts` as a named function `openNewConversation(projectId)`.

If no CDP expression can start a new conversation, the CLI still writes project + storage, focuses the app, and exits 1 with the CDP failure message in section 7. Do not ship a silent “project selected only” behavior as success.

CDP send/receive: JSON messages with incrementing `id`; wait for the matching response or a 2s timeout.

## 7. Errors

All failure messages are **English**, one line on **stderr**. Do not print a stack trace for expected failures. Unexpected exceptions may print a stack.

Exit codes: `0` success / help / version; `1` everything else.

| Condition | stderr (exact) |
|---|---|
| Not macOS | `agy-open supports macOS only` |
| Unknown flag | `Unknown option: <flag>` plus the next line `Try agy-open --help` |
| Path missing / not a directory | `Not a directory: <path>` |
| Antigravity.app missing | `Antigravity.app not found at /Applications/Antigravity.app` |
| `app_storage.json` missing | `Antigravity storage not found. Open Antigravity once, then retry.` |
| Cannot write project or storage | `Cannot write <path>: <code>` |
| CDP timeout / no main page / WebSocket or evaluate failure | `Registered project <id>, but could not open a new conversation. Create one in the app.` |

On CDP failure after a successful register: **do not roll back** the project JSON or storage. The project is still useful.

JSON writes are always temp-file-then-rename in the destination directory.

## 8. Testing

Use Node's built-in test runner [`node:test`](https://nodejs.org/docs/latest/api/test.html) and `node:assert/strict`. No Jest/Vitest.

- Tests live in `test/*.test.ts`.
- `pnpm test` compiles, then `node --test` on the compiled test files.
- `project.ts` and `storage.ts` take directory/file paths as arguments.
- Tests use `fs.mkdtemp` under `os.tmpdir()`, never the real `~/.gemini` or real `app_storage.json`.

Automated coverage:

- Path resolution and `file://` URIs including spaces.
- Match an existing project by `folderUri`.
- Create a new project JSON with the standard shape.
- Ignore JSON files without `folderUri`.
- Storage update changes only the two fields.
- Main-page picker from a sample `/json` payload.

Not automated (manual checklist in README):

- Cold start with Antigravity quit.
- App already running on a different project.
- Re-opening a folder that already has a project.
- Path with spaces.

No CI in v1.

## 9. Engineering constraints

- Node.js `>=22` (`engines` field).
- TypeScript `target` ES2022, `module` NodeNext.
- `pnpm` only. TypeScript is a devDependency.
- `dist/` is gitignored; users build locally.
- Do not read or write files outside: the target folder (read-only check), `~/.gemini/config/projects/`, and `~/Library/Application Support/Antigravity/` (`app_storage.json`, `DevToolsActivePort`).

## 10. Implementation order (for the later plan, not this spec)

The implementation plan should follow TDD on `project.ts` and `storage.ts` first, then `cdp.ts` helpers, then the live CDP probe, then `cli.ts` + `app.ts`, then README install instructions.
