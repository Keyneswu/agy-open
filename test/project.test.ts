import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { ensureProject } from "../src/project.js";

const dirs: string[] = [];

function tmpProjects(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-open-projects-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("ensureProject", () => {
  test("creates the projects directory and a standard JSON file", () => {
    const root = tmpProjects();
    const projectsDir = path.join(root, "projects");
    const folderUri = "file:///Users/demo/agy-open";
    const id = ensureProject(projectsDir, folderUri, "agy-open");
    const file = path.join(projectsDir, `${id}.json`);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      id: string;
      name: string;
      projectResources: { resources: Array<{ folderUri: string }> };
      settings: Record<string, unknown>;
      isWorkspaceOnly: boolean;
    };
    assert.equal(raw.id, id);
    assert.equal(raw.name, "agy-open");
    assert.equal(raw.projectResources.resources[0]?.folderUri, folderUri);
    assert.deepEqual(raw.settings, {});
    assert.equal(raw.isWorkspaceOnly, false);
  });

  test("returns the existing id when folderUri matches", () => {
    const projectsDir = tmpProjects();
    const folderUri = "file:///Users/demo/agy-open";
    const first = ensureProject(projectsDir, folderUri, "agy-open");
    const second = ensureProject(projectsDir, folderUri, "other-name");
    assert.equal(second, first);
    const files = fs.readdirSync(projectsDir).filter((f) => f.endsWith(".json"));
    assert.equal(files.length, 1);
  });

  test("matches folderUri after stripping a trailing slash", () => {
    const projectsDir = tmpProjects();
    const id = ensureProject(
      projectsDir,
      "file:///Users/demo/agy-open/",
      "agy-open",
    );
    assert.equal(
      ensureProject(projectsDir, "file:///Users/demo/agy-open", "agy-open"),
      id,
    );
  });

  test("skips JSON files that have no folderUri", () => {
    const projectsDir = tmpProjects();
    fs.writeFileSync(
      path.join(projectsDir, "default-cli-project.json"),
      JSON.stringify({
        id: "default-cli-project",
        name: "CLI Project",
        projectResources: {},
      }),
    );
    fs.writeFileSync(
      path.join(projectsDir, "outside-of-project.json"),
      JSON.stringify({
        id: "outside-of-project",
        name: "Outside of Project",
      }),
    );
    const id = ensureProject(
      projectsDir,
      "file:///Users/demo/agy-open",
      "agy-open",
    );
    assert.notEqual(id, "default-cli-project");
    assert.notEqual(id, "outside-of-project");
    assert.ok(fs.existsSync(path.join(projectsDir, `${id}.json`)));
  });
});
