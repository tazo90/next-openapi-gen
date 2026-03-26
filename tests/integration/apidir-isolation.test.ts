import { describe, it, expect } from "vitest";
import { ZodSchemaConverter } from "@next-openapi-gen/schema/zod/zod-converter.js";
import path from "path";
import os from "os";
import fs from "fs";

/**
 * Regression test for: @response ignores apiDir and leaks schemas from private routes
 *
 * findRouteFiles() was hardcoding common Next.js API directories instead of using
 * the configured apiDir. This caused schemas from private routes to be registered
 * even when apiDir was restricted to a public subdirectory.
 */
describe("ZodSchemaConverter – apiDir isolation", () => {
  function createFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-apidir-"));

    // Separate schemas dir (simulates src/schemas or similar – NOT inside the API tree)
    const schemasDir = path.join(root, "src", "schemas");
    const publicApiDir = path.join(root, "src", "app", "api", "public");
    const privateApiDir = path.join(root, "src", "app", "api", "private", "secrets");

    fs.mkdirSync(schemasDir, { recursive: true });
    fs.mkdirSync(path.join(publicApiDir, "items"), { recursive: true });
    fs.mkdirSync(privateApiDir, { recursive: true });

    // Public route – defines PublicItemSchema inline (no separate schema file)
    fs.writeFileSync(
      path.join(publicApiDir, "items", "route.ts"),
      `import { z } from "zod";
export const PublicItemSchema = z.object({ id: z.string(), name: z.string() });
/**
 * @openapi
 * @response PublicItemSchema
 */
export async function GET() {}
`,
    );

    // Private route – defines SecretSchema (must NOT appear in output)
    fs.writeFileSync(
      path.join(privateApiDir, "route.ts"),
      `import { z } from "zod";
export const SecretSchema = z.object({ token: z.string() });
/**
 * @openapi
 * @response SecretSchema
 */
export async function GET() {}
`,
    );

    return {
      root,
      publicApiDir,
      schemasDir,
    };
  }

  it("findRouteFiles() returns only files inside apiDir", () => {
    const { root, publicApiDir, schemasDir } = createFixture();
    try {
      const converter = new ZodSchemaConverter(schemasDir, publicApiDir);
      const routeFiles = converter.findRouteFiles();

      // Only the public route should be found
      expect(routeFiles.length).toBe(1);
      expect(routeFiles[0]).toContain("public");
      expect(routeFiles[0]).not.toContain("private");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does NOT register schemas from routes outside apiDir", () => {
    const { root, publicApiDir, schemasDir } = createFixture();
    try {
      // schemaDir is the dedicated schemas directory (no private routes there)
      // apiDir restricts route-file scanning to the public subtree
      const converter = new ZodSchemaConverter(schemasDir, publicApiDir);

      // Trigger schema lookup – internally calls findRouteFiles()
      converter.convertZodSchemaToOpenApi("PublicItemSchema");

      // SecretSchema lives in a private route outside apiDir – must not be registered
      expect(converter.zodSchemas).not.toHaveProperty("SecretSchema");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("still finds schemas defined inside apiDir route files", () => {
    const { root, publicApiDir, schemasDir } = createFixture();
    try {
      const converter = new ZodSchemaConverter(schemasDir, publicApiDir);

      const result = converter.convertZodSchemaToOpenApi("PublicItemSchema");

      expect(result).not.toBeNull();
      expect(result!.type).toBe("object");
      expect(result!.properties).toHaveProperty("id");
      expect(result!.properties).toHaveProperty("name");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("without apiDir falls back to heuristic scan (existing behaviour unchanged)", () => {
    // Without apiDir, no change in behaviour – should not throw
    const converter = new ZodSchemaConverter("/nonexistent/schemas");
    expect(converter.apiDir).toBeUndefined();
    const result = converter.convertZodSchemaToOpenApi("NonExistentSchema");
    expect(result).toBeNull();
  });
});
