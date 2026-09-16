import os from "node:os";
import path from "node:path";

export function defaultProjectsDir(home = os.homedir()): string {
  return path.join(home, ".gemini", "config", "projects");
}

export function defaultStoragePath(home = os.homedir()): string {
  return path.join(
    home,
    "Library",
    "Application Support",
    "Antigravity",
    "app_storage.json",
  );
}

export function defaultPortFile(home = os.homedir()): string {
  return path.join(
    home,
    "Library",
    "Application Support",
    "Antigravity",
    "DevToolsActivePort",
  );
}
