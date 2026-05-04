import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it } from "vitest";

import { collectAllExportedDefinitions } from "@workspace/openapi-core/schema/typescript/schema-discovery.js";
import { SchemaProcessor } from "@workspace/openapi-core/schema/typescript/schema-processor.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

describe("@id JSDoc tag — component name override", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  describe("collectAllExportedDefinitions — schemaIdAliases population", () => {
    it("registers alias for exported interface with leading JSDoc @id", () => {
      const ast = parseTypeScriptFile(`
        /** @id User */
        export interface UserDto { name: string; }
      `);
      const typeDefinitions: Record<string, any> = {};
      const schemaIdAliases: Record<string, string> = {};

      collectAllExportedDefinitions(ast, typeDefinitions, "fixtures.ts", schemaIdAliases);

      expect(schemaIdAliases["UserDto"]).toBe("User");
      expect(typeDefinitions["UserDto"]).toBeDefined();
      expect(typeDefinitions["User"]).toBeDefined();
      expect(t.isTSInterfaceDeclaration(typeDefinitions["User"].node)).toBe(true);
    });

    it("registers alias for exported type alias with leading JSDoc @id", () => {
      const ast = parseTypeScriptFile(`
        /** @id Audio */
        export type AudioType = { url: string };
      `);
      const typeDefinitions: Record<string, any> = {};
      const schemaIdAliases: Record<string, string> = {};

      collectAllExportedDefinitions(ast, typeDefinitions, "fixtures.ts", schemaIdAliases);

      expect(schemaIdAliases["AudioType"]).toBe("Audio");
      expect(typeDefinitions["Audio"]).toBeDefined();
    });

    it("registers alias for non-exported interface with leading JSDoc @id", () => {
      const ast = parseTypeScriptFile(`
        /** @id InternalModel */
        interface InternalDto { id: number; }
      `);
      const typeDefinitions: Record<string, any> = {};
      const schemaIdAliases: Record<string, string> = {};

      collectAllExportedDefinitions(ast, typeDefinitions, "fixtures.ts", schemaIdAliases);

      expect(schemaIdAliases["InternalDto"]).toBe("InternalModel");
    });

    it("registers alias for trailing inline comment @id", () => {
      const ast = parseTypeScriptFile(`
        export interface AudioInterface { // @id Audio
          url: string;
        }
      `);
      const typeDefinitions: Record<string, any> = {};
      const schemaIdAliases: Record<string, string> = {};

      collectAllExportedDefinitions(ast, typeDefinitions, "fixtures.ts", schemaIdAliases);

      expect(schemaIdAliases["AudioInterface"]).toBe("Audio");
      expect(typeDefinitions["Audio"]).toBeDefined();
    });

    it("does not register alias when no @id tag is present", () => {
      const ast = parseTypeScriptFile(`
        export interface PlainInterface { id: string; }
      `);
      const typeDefinitions: Record<string, any> = {};
      const schemaIdAliases: Record<string, string> = {};

      collectAllExportedDefinitions(ast, typeDefinitions, "fixtures.ts", schemaIdAliases);

      expect(schemaIdAliases).toEqual({});
      expect(typeDefinitions["PlainInterface"]).toBeDefined();
    });

    it("works without schemaIdAliases parameter (backward compatible)", () => {
      const ast = parseTypeScriptFile(`
        /** @id Renamed */
        export interface OriginalName { id: string; }
      `);
      const typeDefinitions: Record<string, any> = {};

      expect(() => {
        collectAllExportedDefinitions(ast, typeDefinitions, "fixtures.ts");
      }).not.toThrow();

      expect(typeDefinitions["OriginalName"]).toBeDefined();
    });
  });

  describe("SchemaProcessor — end-to-end @id override", () => {
    it("exposes schema under override name for exported interface", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-id-override-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        ["/** @id User */", "export interface UserDto {", "  name: string;", "}"].join("\n"),
      );

      const processor = new SchemaProcessor(root, "typescript");
      const schema = processor.findSchemaDefinition("User", "response");

      expect(schema).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      });
    });

    it("original name is redirected to override name via findSchemaDefinition", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-id-redirect-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          "/** @id Audio */",
          "export interface AudioInterface {",
          "  url: string;",
          "  title?: string;",
          "}",
        ].join("\n"),
      );

      const processor = new SchemaProcessor(root, "typescript");
      const byOverride = processor.findSchemaDefinition("Audio", "response");
      const byOriginal = processor.findSchemaDefinition("AudioInterface", "response");

      expect(byOverride).toEqual(byOriginal);
      expect(byOverride).toEqual({
        type: "object",
        properties: {
          url: { type: "string" },
          title: { type: "string" },
        },
        required: ["url"],
      });
    });

    it("original name does not appear in getDefinedSchemas output", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-id-filter-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        ["/** @id User */", "export interface UserDto {", "  name: string;", "}"].join("\n"),
      );

      const processor = new SchemaProcessor(root, "typescript");
      processor.findSchemaDefinition("User", "response");

      const schemas = processor.getDefinedSchemas();

      expect(schemas["User"]).toBeDefined();
      expect(schemas["UserDto"]).toBeUndefined();
    });

    it("type alias with @id override resolves correctly", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-id-typealias-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        ["/** @id Audio */", "export type AudioType = { url: string };"].join("\n"),
      );

      const processor = new SchemaProcessor(root, "typescript");
      const schema = processor.findSchemaDefinition("Audio", "response");

      expect(schema).toEqual({
        type: "object",
        properties: {
          url: { type: "string" },
        },
        required: ["url"],
      });
    });

    it("schemas without @id tag resolve normally", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-id-noop-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        ["export interface PlainSchema {", "  value: number;", "}"].join("\n"),
      );

      const processor = new SchemaProcessor(root, "typescript");
      const schema = processor.findSchemaDefinition("PlainSchema", "response");

      expect(schema).toEqual({
        type: "object",
        properties: {
          value: { type: "number" },
        },
        required: ["value"],
      });
    });
  });
});
