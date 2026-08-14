import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findTypeScriptConfigFile } from "@workspace/openapi-core/shared/tsconfig-file.js";

describe("findTypeScriptConfigFile", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("returns the nearest tsconfig.json", () => {
    const root = createTempRoot();
    const nested = path.join(root, "pkg", "src");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["pkg"] }));
    fs.writeFileSync(path.join(root, "pkg", "tsconfig.json"), JSON.stringify({ include: ["src"] }));
    const sourceFile = path.join(nested, "route.ts");
    fs.writeFileSync(sourceFile, "export {};\n");

    expect(findTypeScriptConfigFile(sourceFile)).toBe(path.join(root, "pkg", "tsconfig.json"));
  });

  it("skips solution-style tsconfig.json files with empty files and project references", () => {
    const root = createTempRoot();
    const nested = path.join(root, "src");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        files: [],
        references: [{ path: "./packages/core" }],
      }),
    );
    const sourceFile = path.join(nested, "route.ts");
    fs.writeFileSync(sourceFile, "export {};\n");

    expect(findTypeScriptConfigFile(sourceFile)).toBeNull();
  });

  it("does not skip a referenced project tsconfig that includes source files", () => {
    const root = createTempRoot();
    const nested = path.join(root, "packages", "core", "src");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        files: [],
        references: [{ path: "./packages/core" }],
      }),
    );
    fs.writeFileSync(
      path.join(root, "packages", "core", "tsconfig.json"),
      JSON.stringify({
        include: ["src"],
        references: [{ path: "../shared" }],
      }),
    );
    const sourceFile = path.join(nested, "index.ts");
    fs.writeFileSync(sourceFile, "export {};\n");

    expect(findTypeScriptConfigFile(sourceFile)).toBe(
      path.join(root, "packages", "core", "tsconfig.json"),
    );
  });

  it("walks past a solution-style config to a parent project tsconfig", () => {
    const root = createTempRoot();
    const nested = path.join(root, "solution", "src");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ include: ["solution"] }));
    fs.writeFileSync(
      path.join(root, "solution", "tsconfig.json"),
      JSON.stringify({
        files: [],
        include: [],
        references: [{ path: "./pkg" }],
      }),
    );
    const sourceFile = path.join(nested, "route.ts");
    fs.writeFileSync(sourceFile, "export {};\n");

    expect(findTypeScriptConfigFile(sourceFile)).toBe(path.join(root, "tsconfig.json"));
  });

  it("does not treat an empty files list without references as a solution config", () => {
    const root = createTempRoot();
    const nested = path.join(root, "src");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ files: [] }));
    const sourceFile = path.join(nested, "route.ts");
    fs.writeFileSync(sourceFile, "export {};\n");

    expect(findTypeScriptConfigFile(sourceFile)).toBe(path.join(root, "tsconfig.json"));
  });

  it("treats unreadable tsconfig.json as a usable project config", () => {
    const root = createTempRoot();
    const nested = path.join(root, "src");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, "tsconfig.json"), "{ files: [], // comments\n}");
    const sourceFile = path.join(nested, "route.ts");
    fs.writeFileSync(sourceFile, "export {};\n");

    expect(findTypeScriptConfigFile(sourceFile)).toBe(path.join(root, "tsconfig.json"));
  });

  function createTempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-tsconfig-file-"));
    roots.push(root);
    return root;
  }
});
