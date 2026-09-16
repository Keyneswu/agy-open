import fs from "node:fs";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import { CliError } from "./errors.js";

export function updateStorage(storagePath: string, projectId: string): void {
  if (!fs.existsSync(storagePath)) {
    throw new CliError(
      "Antigravity storage not found. Open Antigravity once, then retry.",
    );
  }
  const parsed = readJsonFile(storagePath);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CliError(`Cannot write ${storagePath}: EINVAL`);
  }
  const next = {
    ...(parsed as Record<string, unknown>),
    "new-convo-last-selected-project": projectId,
    lastCreatedProjectId: projectId,
  };
  writeJsonAtomic(storagePath, next);
}
