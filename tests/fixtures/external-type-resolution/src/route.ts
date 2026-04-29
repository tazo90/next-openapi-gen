/**
 * Simulates an API route file inside schemaDir that imports types from an
 * external package (outside schemaDir). next-openapi-gen scans this file as
 * part of the schemaDir crawl, so the import is tracked in importMap. When a
 * JSDoc annotation references ExternalUser or ExternalApiError, the schema
 * processor falls back to the TypeScript checker using this file as context.
 *
 * @openapi
 * @response ExternalUser 200 Success
 * @response ExternalApiError 400 Bad Request
 */

import { ExternalUser, ExternalApiError } from "../shared-types";

export type { ExternalUser, ExternalApiError };
