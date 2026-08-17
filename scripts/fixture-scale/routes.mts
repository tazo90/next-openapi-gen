import path from "node:path";

import {
  GENERATED_HEADER,
  SCALE_RESOURCES,
  getOperationId,
  getPathParamsTypeName,
  getResourceOperationsForFramework,
  getRouteBaseSegments,
  getSchemaNames,
  type ResourceDefinition,
  type RouteOperation,
} from "./domain.mts";
import { getGeneratedSchemaModulePaths, type SchemaFlavor } from "./schemas.mts";
import type { SchemaLayout } from "./targets.mts";
import { writeTextFile } from "./utils.mts";

export type FrameworkKind = "next-app-router" | "next-pages-router" | "tanstack" | "react-router";

export type RouteEmitOptions = {
  outputDir: string;
  framework: FrameworkKind;
  flavor: SchemaFlavor;
  schemaLayout: SchemaLayout;
  dryRun: boolean;
  operationIdPrefix: string;
  mixedUsesZod?: (resource: ResourceDefinition, index: number) => boolean;
};

function buildAnnotations(
  resource: ResourceDefinition,
  operation: RouteOperation,
  options: RouteEmitOptions,
  index: number,
): string {
  const names = getSchemaNames(resource);
  const useZod =
    options.flavor === "zod" ||
    options.flavor === "drizzle-zod" ||
    (options.flavor === "mixed" && (options.mixedUsesZod?.(resource, index) ?? index % 2 === 1));
  const entity = useZod ? names.zodEntity : names.entity;
  const listResponse = names.listResponse;
  const pathParamsType = getPathParamsTypeName(resource, operation);
  const listQuery = useZod ? names.zodListQuery : names.listQuery;
  const createInput = useZod ? names.zodCreate : names.createInput;
  const updateInput = useZod ? names.zodUpdate : names.updateInput;
  const lines = [
    ` * ${operation.summary}`,
    ` * @description ${operation.description}`,
    ` * @operationId ${getOperationId(resource, operation, options.operationIdPrefix)}`,
    ` * @tag ${resource.tag}`,
    ` * @responseSet ${operation.responseSet}`,
  ];

  if (operation.auth) {
    lines.push(" * @auth bearer");
  }
  if (pathParamsType) {
    lines.push(` * @pathParams ${pathParamsType}`);
  }
  if (operation.hasQuery) {
    lines.push(` * @params ${listQuery}`);
  }
  if (operation.hasBody) {
    lines.push(` * @body ${operation.kind === "create" ? createInput : updateInput}`);
  }
  if (operation.responseType === "empty") {
    lines.push(" * @response 204:Empty:Resource deleted successfully");
  } else if (operation.responseType === "list") {
    lines.push(` * @response ${listResponse}`);
  } else {
    lines.push(` * @response ${entity}`);
  }
  lines.push(" * @openapi");

  return lines.join("\n");
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function relativeModuleSpecifier(fromFile: string, toModule: string): string {
  const fromDir = path.posix.dirname(toPosixPath(fromFile));
  const relativePath = path.posix.relative(fromDir, toPosixPath(toModule));
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function usesZodSchema(
  options: RouteEmitOptions,
  resource: ResourceDefinition,
  index: number,
): boolean {
  return (
    options.flavor === "zod" ||
    options.flavor === "drizzle-zod" ||
    (options.flavor === "mixed" && (options.mixedUsesZod?.(resource, index) ?? index % 2 === 1))
  );
}

function renderSchemaImports(
  routeFileFromOutput: string,
  resource: ResourceDefinition,
  options: RouteEmitOptions,
  index: number,
): string {
  const modules = getGeneratedSchemaModulePaths(
    resource,
    options.schemaLayout,
    options.flavor,
    usesZodSchema(options, resource, index),
  );
  return `${modules
    .map((modulePath) => `import "${relativeModuleSpecifier(routeFileFromOutput, modulePath)}";`)
    .join("\n")}\n\n`;
}

export function emitRoutes(options: RouteEmitOptions): string[] {
  switch (options.framework) {
    case "next-app-router":
      return emitNextAppRouterRoutes(options);
    case "next-pages-router":
      return emitNextPagesRouterRoutes(options);
    case "tanstack":
      return emitTanstackRoutes(options);
    case "react-router":
      return emitReactRouterRoutes(options);
    default: {
      const neverFramework: never = options.framework;
      throw new Error(`Unsupported framework: ${neverFramework}`);
    }
  }
}

function emitNextAppRouterRoutes(options: RouteEmitOptions): string[] {
  const written: string[] = [];
  const apiRoot = path.join("src", "app", "api");
  const grouped = new Map<
    string,
    Array<{ resource: ResourceDefinition; operation: RouteOperation; index: number }>
  >();

  for (const [index, resource] of SCALE_RESOURCES.entries()) {
    for (const operation of getResourceOperationsForFramework(resource, options.framework)) {
      const segments = [
        ...getRouteBaseSegments(resource, apiRoot),
        ...operationSegmentParts(operation),
      ];
      const key = segments.join("/");
      const entries = grouped.get(key) ?? [];
      entries.push({ resource, operation, index });
      grouped.set(key, entries);
    }
  }

  for (const [key, entries] of grouped.entries()) {
    const segments = key.split("/");
    const firstEntry = entries[0];
    if (!firstEntry) {
      continue;
    }
    const relativeRoutePath = `${segments.join("/")}/route.ts`;
    const filePath = path.join(options.outputDir, ...segments, "route.ts");
    const imports = renderSchemaImports(
      relativeRoutePath,
      firstEntry.resource,
      options,
      firstEntry.index,
    );
    const blocks = entries.map(({ resource, operation, index }) => {
      const annotations = buildAnnotations(resource, operation, options, index);
      return `/**
${annotations}
 */
export async function ${operation.method}() {
  return Response.json({});
}`;
    });
    writeTextFile(
      filePath,
      `${GENERATED_HEADER}${imports}${blocks.join("\n\n")}\n`,
      options.dryRun,
    );
    written.push(filePath);
  }

  return written;
}

function operationSegmentParts(operation: RouteOperation): string[] {
  return operation.segmentPath ? operation.segmentPath.split("/") : [];
}

function emitNextPagesRouterRoutes(options: RouteEmitOptions): string[] {
  const written: string[] = [];

  for (const [index, resource] of SCALE_RESOURCES.entries()) {
    const operations = getResourceOperationsForFramework(resource, options.framework);
    const listOp = operations.find((operation) => operation.kind === "list");
    const createOp = operations.find((operation) => operation.kind === "create");
    const detailOps = operations.filter(
      (operation) => operation.kind !== "list" && operation.kind !== "create",
    );

    if (listOp || createOp) {
      const filePath = path.join(
        options.outputDir,
        "pages",
        "api",
        "generated",
        resource.slug,
        "index.ts",
      );
      const blocks = [];
      if (listOp) {
        blocks.push(renderPagesMethodBlock(resource, listOp, options, index, "GET"));
      }
      if (createOp) {
        blocks.push(renderPagesMethodBlock(resource, createOp, options, index, "POST"));
      }
      writeTextFile(
        filePath,
        `${GENERATED_HEADER}${renderSchemaImports(
          `pages/api/generated/${resource.slug}/index.ts`,
          resource,
          options,
          index,
        )}${blocks.join("\n")}\nexport default function handler() {}\n`,
        options.dryRun,
      );
      written.push(filePath);
    }

    const detailPath = path.join(
      options.outputDir,
      "pages",
      "api",
      "generated",
      resource.slug,
      "[id].ts",
    );
    const detailBlocks = detailOps.map((operation) =>
      renderPagesMethodBlock(resource, operation, options, index, operation.method),
    );
    writeTextFile(
      detailPath,
      `${GENERATED_HEADER}${renderSchemaImports(
        `pages/api/generated/${resource.slug}/[id].ts`,
        resource,
        options,
        index,
      )}${detailBlocks.join("\n")}\nexport default function handler() {}\n`,
      options.dryRun,
    );
    written.push(detailPath);
  }

  return written;
}

function renderPagesMethodBlock(
  resource: ResourceDefinition,
  operation: RouteOperation,
  options: RouteEmitOptions,
  index: number,
  method: string,
): string {
  const annotations = buildAnnotations(resource, operation, options, index);
  return `/**\n${annotations}\n * @method ${method}\n */`;
}

function emitTanstackRoutes(options: RouteEmitOptions): string[] {
  const written: string[] = [];
  const grouped = new Map<
    string,
    Array<{ resource: ResourceDefinition; operation: RouteOperation; index: number }>
  >();

  for (const [index, resource] of SCALE_RESOURCES.entries()) {
    for (const operation of getResourceOperationsForFramework(resource, options.framework)) {
      const fileName = `${resource.slug}${operation.segmentPath ? ".$id" : ""}.ts`;
      const key = fileName;
      const entries = grouped.get(key) ?? [];
      entries.push({ resource, operation, index });
      grouped.set(key, entries);
    }
  }

  for (const [fileName, entries] of grouped.entries()) {
    const firstEntry = entries[0];
    if (!firstEntry) {
      continue;
    }
    const relativeRoutePath = `src/routes/api/generated/${fileName}`;
    const filePath = path.join(options.outputDir, "src", "routes", "api", "generated", fileName);
    const uniqueFnBlocks = mergeTanstackFunctions(entries, options);

    writeTextFile(
      filePath,
      `${GENERATED_HEADER}${renderSchemaImports(
        relativeRoutePath,
        firstEntry.resource,
        options,
        firstEntry.index,
      )}${uniqueFnBlocks.join("\n\n")}\n`,
      options.dryRun,
    );
    written.push(filePath);
  }

  return written;
}

function mergeTanstackFunctions(
  entries: Array<{ resource: ResourceDefinition; operation: RouteOperation; index: number }>,
  options: RouteEmitOptions,
): string[] {
  const loaders = entries.filter(({ operation }) => operation.method === "GET");
  const actions = entries.filter(
    ({ operation }) =>
      operation.method === "POST" || operation.method === "PATCH" || operation.method === "DELETE",
  );

  const blocks: string[] = [];
  if (loaders.length > 0) {
    const body = loaders
      .map(({ resource, operation, index }) => {
        const annotations = buildAnnotations(resource, operation, options, index);
        return `/**
${annotations}
 */`;
      })
      .join("\n");
    blocks.push(`${body}\nexport async function loader() {}`);
  }
  if (actions.length > 0) {
    const body = actions
      .map(({ resource, operation, index }) => {
        const annotations = buildAnnotations(resource, operation, options, index);
        return `/**
${annotations}
 */`;
      })
      .join("\n");
    blocks.push(`${body}\nexport async function action() {}`);
  }
  return blocks;
}

function emitReactRouterRoutes(options: RouteEmitOptions): string[] {
  const written = emitTanstackRoutes(options);
  const indexPath = path.join(options.outputDir, "src", "routes", "api", "generated", "index.ts");
  const specifiers = written
    .map((filePath) => path.posix.basename(toPosixPath(filePath), ".ts"))
    .toSorted((left, right) => left.localeCompare(right))
    .map((fileName) => `import "./${fileName}";`)
    .join("\n");
  writeTextFile(indexPath, `${GENERATED_HEADER}${specifiers}\n`, options.dryRun);
  written.push(indexPath);
  return written;
}
