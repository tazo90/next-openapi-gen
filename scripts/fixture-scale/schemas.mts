import path from "node:path";

import {
  GENERATED_HEADER,
  SCALE_RESOURCES,
  getRouteIdParam,
  getSchemaNames,
  type ResourceDefinition,
} from "./domain.mts";
import type { SchemaLayout } from "./targets.mts";
import { writeTextFile } from "./utils.mts";

export type SchemaFlavor = "typescript" | "zod" | "mixed" | "drizzle-zod";

export function emitSchemas(options: {
  outputDir: string;
  flavor: SchemaFlavor;
  schemaLayout: SchemaLayout;
  dryRun: boolean;
  mixedUsesZod?: (resource: ResourceDefinition, index: number) => boolean;
}): string[] {
  const written: string[] = [];

  for (const [index, resource] of SCALE_RESOURCES.entries()) {
    const useZod =
      options.flavor === "zod" ||
      options.flavor === "drizzle-zod" ||
      (options.flavor === "mixed" && (options.mixedUsesZod?.(resource, index) ?? index % 2 === 1));

    if (options.flavor === "drizzle-zod") {
      const drizzlePath = path.join(
        options.outputDir,
        "src",
        "schemas",
        "generated",
        `${resource.slug}.ts`,
      );
      writeTextFile(drizzlePath, emitDrizzleSchemaFile(resource), options.dryRun);
      written.push(drizzlePath);
      continue;
    }

    const entityRoot = resolveSchemaRoot(options.outputDir, options.schemaLayout, useZod);
    const entityFile = useZod
      ? emitZodEntitySchemaFile(resource)
      : emitTypeScriptEntitySchemaFile(resource, index);
    const inputFile = useZod
      ? emitZodInputSchemaFile(resource)
      : emitTypeScriptInputSchemaFile(resource);

    const entityPath = path.join(entityRoot, `${resource.slug}-entity.ts`);
    const inputPath = path.join(entityRoot, `${resource.slug}-input.ts`);
    writeTextFile(entityPath, entityFile, options.dryRun);
    writeTextFile(inputPath, inputFile, options.dryRun);
    written.push(entityPath, inputPath);
  }

  if (options.flavor === "drizzle-zod") {
    const dbSchemaPath = path.join(options.outputDir, "src", "db", "schema.generated.ts");
    writeTextFile(dbSchemaPath, emitDrizzleDbSchemaFile(), options.dryRun);
    written.push(dbSchemaPath);
  }

  return written;
}

function resolveSchemaRoot(outputDir: string, schemaLayout: SchemaLayout, useZod: boolean): string {
  if (schemaLayout === "schemas-root") {
    return path.join(outputDir, "schemas", "generated");
  }
  if (useZod || schemaLayout === "src-schemas") {
    return path.join(outputDir, "src", "schemas", "generated");
  }
  return path.join(outputDir, "src", "types", "generated");
}

function emitTypeScriptEntitySchemaFile(resource: ResourceDefinition, index: number): string {
  const names = getSchemaNames(resource);
  const routeIdParam = getRouteIdParam(resource);
  const statusUnion = index % 4 === 0 ? `\n  status: "draft" | "active" | "archived";` : "";
  const readonlyFields =
    index % 3 === 0 ? `\n  readonly createdAt: string;\n  readonly updatedAt: string;` : "";
  const pathParamsBlock = resource.nested
    ? `
export type ${names.collectionPathParams} = {
  ${resource.nested.parentParam}: string;
};

export type ${names.idParams} = {
  ${resource.nested.parentParam}: string;
  ${routeIdParam}: string;
};
`
    : `
export type ${names.idParams} = {
  ${routeIdParam}: string;
};
`;

  return `${GENERATED_HEADER}export type ${names.entity} = {
  id: string;
  name: string;
  description?: string;
  active: boolean;${statusUnion}${readonlyFields}
};

export type ${names.listResponse} = {
  items: ${names.entity}[];
  total: number;
  page: number;
  limit: number;
};
${pathParamsBlock}`;
}

function emitTypeScriptInputSchemaFile(resource: ResourceDefinition): string {
  const names = getSchemaNames(resource);

  return `${GENERATED_HEADER}export type ${names.listQuery} = {
  page?: string;
  limit?: string;
  search?: string;
  active?: "true" | "false";
};

export type ${names.createInput} = {
  name: string;
  description?: string;
  active?: boolean;
};

export type ${names.updateInput} = {
  name?: string;
  description?: string;
  active?: boolean;
};
`;
}

function emitZodEntitySchemaFile(resource: ResourceDefinition): string {
  const names = getSchemaNames(resource);
  const routeIdParam = getRouteIdParam(resource);
  const pathParamsBlock = resource.nested
    ? `
export const ${names.zodCollectionPathParams} = z.object({
  ${resource.nested.parentParam}: z.string().uuid(),
});

export const ${names.zodIdParams} = z.object({
  ${resource.nested.parentParam}: z.string().uuid(),
  ${routeIdParam}: z.string().uuid(),
});
`
    : `
export const ${names.zodIdParams} = z.object({
  ${routeIdParam}: z.string().uuid(),
});
`;

  return `${GENERATED_HEADER}import { z } from "zod";

export const ${names.zodEntity} = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  active: z.boolean(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const ${names.listResponse} = z.object({
  items: z.array(${names.zodEntity}),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
${pathParamsBlock}`;
}

function emitZodInputSchemaFile(resource: ResourceDefinition): string {
  const names = getSchemaNames(resource);

  return `${GENERATED_HEADER}import { z } from "zod";

export const ${names.zodListQuery} = z.object({
  page: z.string().regex(/^\\d+$/).optional(),
  limit: z.string().regex(/^\\d+$/).optional(),
  search: z.string().max(120).optional(),
  active: z.enum(["true", "false"]).optional(),
});

export const ${names.zodCreate} = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  active: z.boolean().optional(),
});

export const ${names.zodUpdate} = ${names.zodCreate}.partial();
`;
}

function emitDrizzleDbSchemaFile(): string {
  const tables = SCALE_RESOURCES.map((resource) => {
    return `export const ${toCamelCase(resource.tableName)} = pgTable("${resource.tableName}", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: varchar("description", { length: 500 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});`;
  }).join("\n\n");

  return `${GENERATED_HEADER}import { boolean, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

${tables}
`;
}

function emitDrizzleSchemaFile(resource: ResourceDefinition): string {
  const names = getSchemaNames(resource);
  const routeIdParam = getRouteIdParam(resource);
  const tableVar = toCamelCase(resource.tableName);

  return `${GENERATED_HEADER}import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { ${tableVar} } from "../../db/schema.generated";

export const ${names.zodCreate} = createInsertSchema(${tableVar}, {
  name: (schema) => schema.min(1).max(120),
  description: (schema) => schema.max(500).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const ${names.zodUpdate} = ${names.zodCreate}.partial();

export const ${names.zodEntity} = createSelectSchema(${tableVar});

export const ${names.listResponse} = z.object({
  items: z.array(${names.zodEntity}),
  total: z.number().int().nonnegative(),
});

${
  resource.nested
    ? `export const ${names.zodCollectionPathParams} = z.object({
  ${resource.nested.parentParam}: z.string().regex(/^\\d+$/),
});

export const ${names.zodIdParams} = z.object({
  ${resource.nested.parentParam}: z.string().regex(/^\\d+$/),
  ${routeIdParam}: z.string().regex(/^\\d+$/),
});`
    : `export const ${names.zodIdParams} = z.object({
  ${routeIdParam}: z.string().regex(/^\\d+$/),
});`
}

export const ${names.zodListQuery} = z.object({
  page: z.string().regex(/^\\d+$/).optional(),
  limit: z.string().regex(/^\\d+$/).optional(),
});
`;
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}
