import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  newConversationUrl,
  pickMainPage,
  readCdpPort,
  urlHasProjectSection,
  type CdpTarget,
} from "../src/cdp.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("pickMainPage", () => {
  test("selects the first https://127.0.0.1 page", () => {
    const targets: CdpTarget[] = [
      {
        type: "iframe",
        url: "https://127.0.0.1:9/hidden",
        webSocketDebuggerUrl: "ws://127.0.0.1:9/devtools/page/a",
      },
      {
        type: "page",
        url: "devtools://devtools/bundled/inspector.html",
      },
      {
        type: "page",
        url: "https://127.0.0.1:61686/?section=old",
        webSocketDebuggerUrl: "ws://127.0.0.1:9/devtools/page/main",
      },
      {
        type: "page",
        url: "https://127.0.0.1:61686/other",
        webSocketDebuggerUrl: "ws://127.0.0.1:9/devtools/page/other",
      },
    ];
    const main = pickMainPage(targets);
    assert.equal(main?.webSocketDebuggerUrl, "ws://127.0.0.1:9/devtools/page/main");
  });

  test("returns undefined when no main page exists", () => {
    assert.equal(
      pickMainPage([{ type: "page", url: "https://example.com/" }]),
      undefined,
    );
  });
});

describe("readCdpPort", () => {
  test("reads the first line as the port", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-open-cdp-"));
    dirs.push(dir);
    const file = path.join(dir, "DevToolsActivePort");
    fs.writeFileSync(file, "61686\n/devtools/browser/abc\n");
    assert.equal(readCdpPort(file), 61686);
  });
});

describe("newConversationUrl", () => {
  test("builds a section URL from origin and project id", () => {
    assert.equal(
      newConversationUrl("https://127.0.0.1:1234", "abc def"),
      "https://127.0.0.1:1234/?section=abc%20def",
    );
  });
});

describe("urlHasProjectSection", () => {
  test("matches the section query that newConversationUrl builds", () => {
    const projectId = "abc def";
    const href = newConversationUrl("https://127.0.0.1:1234", projectId);
    assert.equal(urlHasProjectSection(href, projectId), true);
  });

  test("matches when extra query follows the encoded section", () => {
    assert.equal(
      urlHasProjectSection(
        "https://127.0.0.1:1/?section=abc%20def&x=1",
        "abc def",
      ),
      true,
    );
  });

  test("rejects a different project id", () => {
    assert.equal(
      urlHasProjectSection("https://127.0.0.1:1/?section=other", "abc def"),
      false,
    );
  });

  test("rejects a missing section", () => {
    assert.equal(urlHasProjectSection("https://127.0.0.1:1/", "abc"), false);
  });
});
