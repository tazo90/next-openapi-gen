/**
 * Simulates types defined in a shared package (e.g. node_modules or a workspace
 * package outside of the configured schemaDir). The schema processor cannot scan
 * this file directly — it resolves the type via the TypeScript checker using a
 * route file that imports it as context.
 */

export interface ExternalUser {
  id: number;
  name: string;
  email: string;
}

export interface ExternalApiError {
  message: string;
  code?: string;
  statusCode: number;
}
