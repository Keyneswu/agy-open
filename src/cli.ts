#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertAntigravityInstalled, focusAntigravity } from "./app.js";
import {
  getMainPage,
  openNewConversationWithRetry,
  waitForMainPage,
} from "./cdp.js";
import { CliError } from "./errors.js";
import {
  defaultPortFile,
  defaultProjectsDir,
  defaultStoragePath,
} from "./paths.js";
import { ensureProject } from "./project.js";
import { updateStorage } from "./storage.js";
import { folderUriFromPath } from "./uri.js";

export const VERSION = "0.1.0";

export const HELP = `Usage: agy-open [path]
       agy-open --help
       agy-open --version

Open a folder as an Antigravity project and start a new conversation.
path defaults to the current directory.
`;

export function assertMacOS(platform = process.platform): void {
  if (platform !== "darwin") {
    throw new CliError("agy-open supports macOS only");
  }
}

export function parseArgs(args: string[]): {
  help: boolean;
  version: boolean;
  pathArg: string;
} {
  let help = false;
  let version = false;
  let pathArg: string | undefined;
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      version = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new CliError(`Unknown option: ${arg}\nTry agy-open --help`);
    }
    if (pathArg !== undefined) {
      throw new CliError(`Unknown option: ${arg}\nTry agy-open --help`);
    }
    pathArg = arg;
  }
  return { help, version, pathArg: pathArg ?? "." };
}

export function resolveTargetDir(
  pathArg: string,
  cwd = process.cwd(),
): string {
  const targetDir = path.resolve(cwd, pathArg);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(targetDir);
  } catch {
    throw new CliError(`Not a directory: ${targetDir}`);
  }
  if (!stat.isDirectory()) {
    throw new CliError(`Not a directory: ${targetDir}`);
  }
  return targetDir;
}

export async function main(argv: string[]): Promise<void> {
  assertMacOS();
  const { help, version, pathArg } = parseArgs(argv.slice(2));
  if (help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  assertAntigravityInstalled();
  const targetDir = resolveTargetDir(pathArg);
  const folderUri = folderUriFromPath(targetDir);
  const name = path.basename(targetDir);
  const projectsDir = defaultProjectsDir();
  const storagePath = defaultStoragePath();
  const portFile = defaultPortFile();
  let projectId: string;
  try {
    projectId = ensureProject(projectsDir, folderUri, name);
  } catch (err) {
    if (err instanceof CliError) {
      throw err;
    }
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as NodeJS.ErrnoException).code)
        : "EIO";
    throw new CliError(`Cannot write ${projectsDir}: ${code}`);
  }
  try {
    updateStorage(storagePath, projectId);
  } catch (err) {
    if (err instanceof CliError) {
      throw err;
    }
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as NodeJS.ErrnoException).code)
        : "EIO";
    throw new CliError(`Cannot write ${storagePath}: ${code}`);
  }
  let page = await getMainPage(portFile);
  if (!page?.webSocketDebuggerUrl) {
    focusAntigravity();
    try {
      page = await waitForMainPage(portFile);
    } catch {
      throw new CliError(
        `Registered project ${projectId}, but could not open a new conversation. Create one in the app.`,
      );
    }
  }
  const wsUrl = page.webSocketDebuggerUrl;
  if (!wsUrl) {
    throw new CliError(
      `Registered project ${projectId}, but could not open a new conversation. Create one in the app.`,
    );
  }
  try {
    await openNewConversationWithRetry(wsUrl, projectId);
  } catch {
    try {
      focusAntigravity();
    } catch {
      // ignore focus errors after CDP failure
    }
    throw new CliError(
      `Registered project ${projectId}, but could not open a new conversation. Create one in the app.`,
    );
  }
  focusAntigravity();
  process.stdout.write(
    `Opened new conversation for ${targetDir} (project ${projectId})\n`,
  );
}

async function run(): Promise<void> {
  try {
    await main(process.argv);
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = err.exitCode;
      return;
    }
    if (err instanceof Error) {
      process.stderr.write(`${err.stack ?? err.message}\n`);
    } else {
      process.stderr.write(`${String(err)}\n`);
    }
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  void run();
}
