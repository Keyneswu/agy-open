import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { CliError } from "../src/errors.js";
import {
  assertMacOS,
  parseArgs,
  resolveTargetDir,
} from "../src/cli.js";

describe("assertMacOS", () => {
  test("throws on linux", () => {
    assert.throws(
      () => assertMacOS("linux"),
      (err: unknown) =>
        err instanceof CliError && err.message === "agy-open supports macOS only",
    );
  });

  test("allows darwin", () => {
    assert.doesNotThrow(() => assertMacOS("darwin"));
  });
});

describe("parseArgs", () => {
  test("defaults path to .", () => {
    assert.deepEqual(parseArgs([]), {
      help: false,
      version: false,
      pathArg: ".",
    });
  });

  test("accepts a path", () => {
    assert.equal(parseArgs(["./proj"]).pathArg, "./proj");
  });

  test("help and version", () => {
    assert.equal(parseArgs(["--help"]).help, true);
    assert.equal(parseArgs(["--version"]).version, true);
  });

  test("unknown flag is two lines", () => {
    assert.throws(
      () => parseArgs(["--nope"]),
      (err: unknown) =>
        err instanceof CliError &&
        err.message === "Unknown option: --nope\nTry agy-open --help",
    );
  });
});

describe("resolveTargetDir", () => {
  test("resolves . to an existing directory", () => {
    const dir = resolveTargetDir(".", process.cwd());
    assert.equal(dir, process.cwd());
  });

  test("rejects a missing path", () => {
    const missing = path.join(os.tmpdir(), "agy-open-missing-path-xyz");
    assert.throws(
      () => resolveTargetDir(missing, "/"),
      (err: unknown) =>
        err instanceof CliError && err.message === `Not a directory: ${missing}`,
    );
  });

  test("rejects a file", () => {
    const file = fs.mkdtempSync(path.join(os.tmpdir(), "agy-open-file-"));
    const target = path.join(file, "x.txt");
    fs.writeFileSync(target, "x");
    try {
      assert.throws(
        () => resolveTargetDir(target, "/"),
        (err: unknown) =>
          err instanceof CliError && err.message === `Not a directory: ${target}`,
      );
    } finally {
      fs.rmSync(file, { recursive: true, force: true });
    }
  });
});
