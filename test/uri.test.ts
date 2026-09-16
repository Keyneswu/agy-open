import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { folderUriFromPath, normalizeFolderUri } from "../src/uri.js";

describe("folderUriFromPath", () => {
  test("encodes spaces in the path", () => {
    const abs = path.join("/Users/demo", "My Project");
    assert.equal(folderUriFromPath(abs), "file:///Users/demo/My%20Project");
  });

  test("keeps an ordinary absolute path", () => {
    assert.equal(
      folderUriFromPath("/Users/demo/agy-open"),
      "file:///Users/demo/agy-open",
    );
  });
});

describe("normalizeFolderUri", () => {
  test("strips a trailing slash", () => {
    assert.equal(
      normalizeFolderUri("file:///Users/demo/agy-open/"),
      "file:///Users/demo/agy-open",
    );
  });

  test("does not strip file:///", () => {
    assert.equal(normalizeFolderUri("file:///"), "file:///");
  });

  test("leaves a path without trailing slash unchanged", () => {
    assert.equal(
      normalizeFolderUri("file:///Users/demo/agy-open"),
      "file:///Users/demo/agy-open",
    );
  });
});
