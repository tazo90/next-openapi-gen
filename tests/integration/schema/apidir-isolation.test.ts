import fs from "fs";
import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import { ZodSchemaConverter } from "@next-openapi-gen/schema/zod/zod-converter.js";

describe("ZodSchemaConverter apiDir isolation", () => {
  function createFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-apidir-"));

    const schemasDir = path.join(root, "src", "schemas");
    const publicApiDir = path.join(root, "src", "app", "api", "public");
    const privateApiDir = path.join(root, "src", "app", "api", "private", "secrets");

    fs.mkdirSync(schemasDir, { recursive: true });
    fs.mkdirSync(path.join(publicApiDir, "items"), { recursive: true });
    fs.mkdirSync(privateApiDir, { recursive: true });

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

  it("finds route files only inside the configured apiDir", () => {
    const { root, publicApiDir, schemasDir } = createFixture();
    try {
      const converter = new ZodSchemaConverter(schemasDir, publicApiDir);
      const routeFiles = converter.findRouteFiles();

      expect(routeFiles).toHaveLength(1);
      expect(routeFiles[0]).toContain("public");
      expect(routeFiles[0]).not.toContain("private");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not register schemas from routes outside apiDir", () => {
    const { root, publicApiDir, schemasDir } = createFixture();
    try {
      const converter = new ZodSchemaConverter(schemasDir, publicApiDir);
      converter.convertZodSchemaToOpenApi("PublicItemSchema");

      expect(converter.zodSchemas).not.toHaveProperty("SecretSchema");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
