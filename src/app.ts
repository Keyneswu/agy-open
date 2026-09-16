import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { CliError } from "./errors.js";

export const ANTIGRAVITY_APP = "/Applications/Antigravity.app";

export function assertAntigravityInstalled(
  appPath = ANTIGRAVITY_APP,
): void {
  if (!fs.existsSync(appPath)) {
    throw new CliError(
      "Antigravity.app not found at /Applications/Antigravity.app",
    );
  }
}

export function focusAntigravity(): void {
  execFileSync("open", ["-a", "Antigravity"], { stdio: "ignore" });
}
