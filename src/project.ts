import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.js";
import { normalizeFolderUri } from "./uri.js";

type ProjectJson = {
  id?: unknown;
  projectResources?: {
    resources?: Array<{ folderUri?: unknown }>;
  };
};

function collectedFolderUris(value: unknown): string[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const rec = value as ProjectJson;
  const resources = rec.projectResources?.resources;
  if (!Array.isArray(resources)) {
    return [];
  }
  const uris: string[] = [];
  for (const resource of resources) {
    if (resource && typeof resource.folderUri === "string") {
      uris.push(normalizeFolderUri(resource.folderUri));
    }
  }
  return uris;
}

function findExistingId(projectsDir: string, folderUri: string): string | undefined {
  const wanted = normalizeFolderUri(folderUri);
  let names: string[];
  try {
    names = fs.readdirSync(projectsDir);
  } catch (err) {
    if (isErrno(err) && err.code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const full = path.join(projectsDir, name);
    let parsed: unknown;
    try {
      parsed = readJsonFile(full);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) {
      continue;
    }
    if (!collectedFolderUris(parsed).includes(wanted)) {
      continue;
    }
    const id = (parsed as ProjectJson).id;
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }
  return undefined;
}

function isErrno(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}

export function ensureProject(
  projectsDir: string,
  folderUri: string,
  name: string,
): string {
  const existing = findExistingId(projectsDir, folderUri);
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  const record = {
    id,
    name,
    projectResources: {
      resources: [{ folderUri: normalizeFolderUri(folderUri) }],
    },
    settings: {},
    isWorkspaceOnly: false,
  };
  writeJsonAtomic(path.join(projectsDir, `${id}.json`), record);
  return id;
}
