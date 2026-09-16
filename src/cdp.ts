import fs from "node:fs";
import http from "node:http";

export type CdpTarget = {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

export function pickMainPage(targets: CdpTarget[]): CdpTarget | undefined {
  return targets.find(
    (target) =>
      target.type === "page" && target.url.startsWith("https://127.0.0.1:"),
  );
}

export function readCdpPort(portFilePath: string): number {
  const first = fs.readFileSync(portFilePath, "utf8").split(/\r?\n/, 1)[0] ?? "";
  const port = Number.parseInt(first, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid DevToolsActivePort: ${portFilePath}`);
  }
  return port;
}

export function newConversationUrl(origin: string, projectId: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}/?section=${encodeURIComponent(projectId)}`;
}


function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTargets(port: number): Promise<CdpTarget[]> {
  const body = await new Promise<string>((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${port}/json`,
      { timeout: 2000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("CDP /json timeout"));
    });
  });
  const parsed: unknown = JSON.parse(body);
  if (!Array.isArray(parsed)) {
    throw new Error("CDP /json did not return an array");
  }
  return parsed as CdpTarget[];
}

export async function getMainPage(
  portFilePath: string,
): Promise<CdpTarget | undefined> {
  try {
    const port = readCdpPort(portFilePath);
    const targets = await fetchTargets(port);
    return pickMainPage(targets);
  } catch {
    return undefined;
  }
}

export async function waitForMainPage(
  portFilePath: string,
  timeoutMs = 30_000,
  intervalMs = 200,
): Promise<CdpTarget> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = await getMainPage(portFilePath);
    if (page?.webSocketDebuggerUrl) {
      return page;
    }
    await sleep(intervalMs);
  }
  throw new Error("Timed out waiting for Antigravity CDP");
}

type CdpResult = { id?: number; result?: { result?: { value?: unknown } }; error?: unknown };

async function cdpCall(
  webSocketDebuggerUrl: string,
  method: string,
  params: Record<string, unknown>,
  id = 1,
): Promise<CdpResult> {
  const ws = new WebSocket(webSocketDebuggerUrl);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP websocket timeout")), 2000);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP websocket error"));
      });
    });
    const payload = JSON.stringify({ id, method, params });
    const response = await new Promise<CdpResult>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP response timeout")), 2000);
      ws.addEventListener("message", (event) => {
        const parsed = JSON.parse(String(event.data)) as CdpResult;
        if (parsed.id !== id) {
          return;
        }
        clearTimeout(timer);
        resolve(parsed);
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP websocket error"));
      });
      ws.send(payload);
    });
    if (response.error) {
      throw new Error(`CDP ${method} failed`);
    }
    return response;
  } finally {
    ws.close();
  }
}

export async function openNewConversation(
  webSocketDebuggerUrl: string,
  projectId: string,
): Promise<void> {
  const originResult = await cdpCall(webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: "window.location.origin",
    returnByValue: true,
  });
  const origin = originResult.result?.result?.value;
  if (typeof origin !== "string" || origin.length === 0) {
    throw new Error("Could not read window.location.origin");
  }
  const url = newConversationUrl(origin, projectId);
  await cdpCall(
    webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression: `window.location.href = ${JSON.stringify(url)}`,
      returnByValue: true,
    },
    2,
  );
}

export async function openNewConversationWithRetry(
  webSocketDebuggerUrl: string,
  projectId: string,
  attempts = 3,
): Promise<void> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await openNewConversation(webSocketDebuggerUrl, projectId);
      return;
    } catch (err) {
      last = err;
      if (i < attempts - 1) {
        await sleep(400);
      }
    }
  }
  throw last;
}
