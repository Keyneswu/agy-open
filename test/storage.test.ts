import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { CliError } from "../src/errors.js";
import { updateStorage } from "../src/storage.js";

const dirs: string[] = [];

function tmpFile(name: string, contents?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-open-storage-"));
  dirs.push(dir);
  const file = path.join(dir, name);
  if (contents !== undefined) {
    fs.writeFileSync(file, contents);
  }
  return file;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("updateStorage", () => {
  test("sets the two project fields and keeps other keys", () => {
    const file = tmpFile(
      "app_storage.json",
      JSON.stringify({
        "ide-install-wizard-shown": true,
        "new-convo-last-selected-project": "old",
        extra: { nested: 1 },
      }),
    );
    updateStorage(file, "36b37401-c9fa-44ea-8b01-fa664dfe70ce");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    assert.equal(
      raw["new-convo-last-selected-project"],
      "36b37401-c9fa-44ea-8b01-fa664dfe70ce",
    );
    assert.equal(
      raw["lastCreatedProjectId"],
      "36b37401-c9fa-44ea-8b01-fa664dfe70ce",
    );
    assert.equal(raw["ide-install-wizard-shown"], true);
    assert.deepEqual(raw.extra, { nested: 1 });
  });

  test("throws CliError when the file is missing", () => {
    const file = tmpFile("app_storage.json", "{}");
    fs.rmSync(file);
    assert.throws(
      () => updateStorage(file, "abc"),
      (err: unknown) =>
        err instanceof CliError &&
        err.message ===
          "Antigravity storage not found. Open Antigravity once, then retry.",
    );
  });
});
