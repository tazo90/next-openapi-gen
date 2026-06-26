import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { createDefaultGenerationAdapters } from "@workspace/openapi-cli";
import { normalizeOpenApiConfig } from "@workspace/openapi-core/config/normalize.js";
import { runGenerationOrchestrator } from "@workspace/openapi-core/core/orchestrator.js";

import {
  createTempProject,
  withProjectCwd,
  writeAppRoute,
  writeOpenApiTemplate,
} from "../../helpers/test-project.js";

function generateSpec(routeContent: string, templateOverrides: Record<string, unknown> = {}) {
  const project = createTempProject("nxog-exclude-schemas-");

  try {
    const templatePath = writeOpenApiTemplate(project.root, templateOverrides);
    writeAppRoute(project.root, ["products", "[id]"], routeContent);

    return withProjectCwd(project.root, () => {
      const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
      const config = normalizeOpenApiConfig(template);
      const adapters = createDefaultGenerationAdapters();

      const result = runGenerationOrchestrator({
        config,
        createFrameworkSource: adapters.createFrameworkSource,
        template,
      });

      return { result, project };
    });
  } catch (err) {
    project.cleanup();
    throw err;
  }
}

describe("excludeSchemas config option", () => {
  it("excludes schemas matching exact name", () => {
    const { result, project } = generateSpec(
      `
import { z } from "zod";

const productIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });
export type ProductIdParams = z.infer<typeof productIdParamsSchema>;

const productSchema = z.object({ id: z.number(), name: z.string() });
export type Product = z.infer<typeof productSchema>;

/**
 * @openapi
 * @pathParams ProductIdParams
 * @response 200 : Product : OK
 */
export async function GET() {}
`,
      { excludeSchemas: ["productIdParamsSchema", "ProductIdParams"] },
    );

    try {
      const schemas = result.document.components?.schemas ?? {};
      expect(schemas).not.toHaveProperty("productIdParamsSchema");
      expect(schemas).not.toHaveProperty("ProductIdParams");
      expect(schemas).toHaveProperty("Product");
    } finally {
      project.cleanup();
    }
  });

  it("excludes schemas matching wildcard *Params pattern", () => {
    const { result, project } = generateSpec(
      `
import { z } from "zod";

const productIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });
export type ProductIdParams = z.infer<typeof productIdParamsSchema>;

const productSchema = z.object({ id: z.number(), name: z.string() });
export type Product = z.infer<typeof productSchema>;

/**
 * @openapi
 * @pathParams ProductIdParams
 * @response 200 : Product : OK
 */
export async function GET() {}
`,
      { excludeSchemas: ["*Params"] },
    );

    try {
      const schemas = result.document.components?.schemas ?? {};
      expect(schemas).not.toHaveProperty("ProductIdParams");
      expect(schemas).toHaveProperty("Product");
    } finally {
      project.cleanup();
    }
  });
});

describe("@internal JSDoc tag on Zod schemas", () => {
  it("excludes Zod schema marked @internal from components", () => {
    const { result, project } = generateSpec(`
import { z } from "zod";

/** @internal */
const productIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });
export type ProductIdParams = z.infer<typeof productIdParamsSchema>;

const productSchema = z.object({ id: z.number(), name: z.string() });
export type Product = z.infer<typeof productSchema>;

/**
 * @openapi
 * @pathParams ProductIdParams
 * @response 200 : Product : OK
 */
export async function GET() {}
`);

    try {
      const schemas = result.document.components?.schemas ?? {};
      expect(schemas).not.toHaveProperty("productIdParamsSchema");
      expect(schemas).toHaveProperty("Product");
    } finally {
      project.cleanup();
    }
  });

  it("excludes exported Zod const marked @internal", () => {
    const { result, project } = generateSpec(`
import { z } from "zod";

/** @internal */
export const productBulkSchema = z.array(z.object({ id: z.number() })).max(500);

const productSchema = z.object({ id: z.number(), name: z.string() });
export type Product = z.infer<typeof productSchema>;

/**
 * @openapi
 * @response 200 : Product : OK
 */
export async function GET() {}
`);

    try {
      const schemas = result.document.components?.schemas ?? {};
      expect(schemas).not.toHaveProperty("productBulkSchema");
      expect(schemas).toHaveProperty("Product");
    } finally {
      project.cleanup();
    }
  });
});

describe("excluded schema ref inlining", () => {
  it("inlines path param schema content when schema is excluded via config", () => {
    const { result, project } = generateSpec(
      `
import { z } from "zod";

const productIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });
export type ProductIdParams = z.infer<typeof productIdParamsSchema>;

const productSchema = z.object({ id: z.number(), name: z.string() });
export type Product = z.infer<typeof productSchema>;

/**
 * @openapi
 * @pathParams ProductIdParams
 * @response 200 : Product : OK
 */
export async function GET() {}
`,
      { excludeSchemas: ["productIdParamsSchema", "ProductIdParams"] },
    );

    try {
      const schemas = result.document.components?.schemas ?? {};
      expect(schemas).not.toHaveProperty("productIdParamsSchema");
      expect(schemas).not.toHaveProperty("ProductIdParams");

      const getOp = result.document.paths?.["/products/{id}"]?.get;
      expect(getOp).toBeDefined();

      const pathParam = getOp?.parameters?.find((p: any) => p.in === "path" && p.name === "id");
      expect(pathParam).toBeDefined();
      const schema = (pathParam as any).schema;
      expect(schema).not.toHaveProperty("$ref");
    } finally {
      project.cleanup();
    }
  });
});
