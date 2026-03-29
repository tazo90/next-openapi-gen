import type { OpenApiVersion, RouterType, SchemaType } from "../shared/types.js";

export const DEFAULT_API_DIR = "./src/app/api";
export const DEFAULT_DOCS_URL = "api-docs";
export const DEFAULT_GENERATED_OPENAPI_FILENAME = "openapi.json";
export const DEFAULT_GENERATE_TEMPLATE_PATH = "next.openapi.json";
export const DEFAULT_INCLUDE_OPENAPI_ROUTES = false;
export const DEFAULT_INIT_SCHEMA_TYPE: SchemaType = "zod";
export const DEFAULT_OPENAPI_VERSION: OpenApiVersion = "3.0";
export const DEFAULT_OUTPUT_DIR = "./public";
export const DEFAULT_ROUTER_TYPE: RouterType = "app";
export const DEFAULT_RUNTIME_SCHEMA_TYPE: SchemaType = "typescript";
export const DEFAULT_SCHEMA_DIR = "./src";
export const DEFAULT_UI = "scalar";
export const DEFAULT_DEBUG = false;
export const DEFAULT_DIAGNOSTICS_ENABLED = true;
export const SCHEMA_TYPES = ["zod", "typescript"] as const;
