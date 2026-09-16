import fs from "node:fs";

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
