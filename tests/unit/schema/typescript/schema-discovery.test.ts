import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it } from "vitest";

import {
  collectAllExportedDefinitions,
  collectImports,
  collectTypeDefinitions,
  resolveImportPath,
} from "@next-openapi-gen/schema/typescript/schema-discovery.js";
import { parseTypeScriptFile } from "@next-openapi-gen/shared/utils.js";

describe("TypeScript schema discovery helpers", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("collects named, default, and namespace imports", () => {
    const ast = parseTypeScriptFile(`
      import DefaultThing from "./default";
      import { NamedThing } from "./named";
      import { "kebab-name" as KebabName } from "./named";
      import * as NamespaceThing from "./namespace";
    `);
    const importMap: Record<string, Record<string, string>> = {};
    const filePath = path.join(process.cwd(), "fixtures.ts");

    collectImports(ast, filePath, importMap);

    expect(importMap[path.normalize(filePath)]).toEqual({
      DefaultThing: "./default",
      NamedThing: "./named",
      NamespaceThing: "./namespace",
      "kebab-name": "./named",
    });
  });

  it("resolves relative import paths across ts, tsx, and existing extensions", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-discovery-"));
    roots.push(root);
    const sourceDir = path.join(root, "src");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(root, "target.ts"), "");
    fs.writeFileSync(path.join(root, "component.tsx"), "");
    fs.writeFileSync(path.join(root, "already.ts"), "");
    const fromFile = path.join(sourceDir, "index.ts");

    expect(resolveImportPath("../target", fromFile, fs)).toBe(path.join(root, "target.ts"));
    expect(resolveImportPath("../component", fromFile, fs)).toBe(path.join(root, "component.tsx"));
    expect(resolveImportPath("../already.ts", fromFile, fs)).toBe(path.join(root, "already.ts"));
    expect(resolveImportPath("zod", fromFile, fs)).toBeNull();
    expect(resolveImportPath("../missing", fromFile, fs)).toBeNull();
  });

  it("resolves tsconfig path aliases with the TypeScript resolver", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-paths-"));
    roots.push(root);
    const sourceDir = path.join(root, "src");
    const libDir = path.join(root, "lib");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"],
            "@lib/*": ["lib/*"],
          },
        },
        include: ["src", "lib"],
      }),
    );
    fs.writeFileSync(path.join(sourceDir, "user.ts"), "export type User = { id: string };");
    fs.writeFileSync(path.join(libDir, "event.ts"), "export type Event = { id: string };");

    const fromFile = path.join(sourceDir, "route.ts");

    expect(resolveImportPath("@/user", fromFile, fs)).toBe(path.join(sourceDir, "user.ts"));
    expect(resolveImportPath("@lib/event", fromFile, fs)).toBe(path.join(libDir, "event.ts"));
  });

  it("collects exported definitions without overwriting existing entries", () => {
    const ast = parseTypeScriptFile(`
      type InternalAlias<T> = { value: T };
      interface InternalContract { id: string }
      enum InternalStatus { Active = "active" }
      export type GenericBox<T> = { value: T };
      export type PlainAlias = string;
      export interface UserContract { id: string }
      export enum Status { Active = "active" }
    `);
    const typeDefinitions: Record<string, any> = {
      Status: { node: t.identifier("ExistingStatus"), filePath: "existing.ts" },
    };

    collectAllExportedDefinitions(ast, typeDefinitions, "fixtures.ts");

    expect(typeDefinitions.InternalAlias.filePath).toBe("fixtures.ts");
    expect(t.isTSTypeAliasDeclaration(typeDefinitions.InternalAlias.node)).toBe(true);
    expect(t.isTSInterfaceDeclaration(typeDefinitions.InternalContract.node)).toBe(true);
    expect(t.isTSEnumDeclaration(typeDefinitions.InternalStatus.node)).toBe(true);
    expect(typeDefinitions.GenericBox.filePath).toBe("fixtures.ts");
    expect(t.isTSTypeAliasDeclaration(typeDefinitions.GenericBox.node)).toBe(true);
    expect(t.isTSStringKeyword(typeDefinitions.PlainAlias.node)).toBe(true);
    expect(t.isTSInterfaceDeclaration(typeDefinitions.UserContract.node)).toBe(true);
    expect(typeDefinitions.Status.filePath).toBe("existing.ts");
  });

  it("collects targeted type definitions for aliases, functions, and exported zod schemas", () => {
    const ast = parseTypeScriptFile(`
      import { z } from "zod";
      const LocalSchema = z.object({ id: z.string() });
      interface LocalContract { id: string }
      enum LocalState { Active = "active" }
      export const ExportedSchema = z.object({ name: z.string() });
      export const NotAZodSchema = createSchema();
      function localFactory() { return { id: "1" }; }
      export function makeUser() { return { id: "1" }; }
      export type Result<T> = { value: T };
    `);
    const typeDefinitions: Record<string, any> = {};

    collectTypeDefinitions(ast, "LocalSchema", typeDefinitions, "fixtures.ts");
    collectTypeDefinitions(ast, "ExportedSchema", typeDefinitions, "fixtures.ts");
    collectTypeDefinitions(ast, "LocalContract", typeDefinitions, "fixtures.ts");
    collectTypeDefinitions(ast, "LocalState", typeDefinitions, "fixtures.ts");
    collectTypeDefinitions(ast, "localFactory", typeDefinitions, "fixtures.ts");
    collectTypeDefinitions(ast, "makeUser", typeDefinitions, "fixtures.ts");
    collectTypeDefinitions(ast, "NotAZodSchema", typeDefinitions, "fixtures.ts");
    collectTypeDefinitions(ast, "Result", typeDefinitions, "fixtures.ts");

    expect(typeDefinitions.LocalSchema.filePath).toBe("fixtures.ts");
    expect(typeDefinitions.ExportedSchema.filePath).toBe("fixtures.ts");
    expect(t.isTSInterfaceDeclaration(typeDefinitions.LocalContract.node)).toBe(true);
    expect(t.isTSEnumDeclaration(typeDefinitions.LocalState.node)).toBe(true);
    expect(typeDefinitions.localFactory.filePath).toBe("fixtures.ts");
    expect(typeDefinitions.makeUser.filePath).toBe("fixtures.ts");
    expect(typeDefinitions.NotAZodSchema.filePath).toBe("fixtures.ts");
    expect(t.isTSTypeAliasDeclaration(typeDefinitions.Result.node)).toBe(true);
  });
});
