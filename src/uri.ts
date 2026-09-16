import { pathToFileURL } from "node:url";

export function folderUriFromPath(absPath: string): string {
  return pathToFileURL(absPath).href;
}

export function normalizeFolderUri(uri: string): string {
  if (uri === "file:///") {
    return uri;
  }
  return uri.endsWith("/") ? uri.slice(0, -1) : uri;
}
