import { DataTypes } from "../types.js";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export interface RouterStrategy {
  /** Process a file and call addRoute for each discovered endpoint */
  processFile(
    filePath: string,
    addRoute: (method: string, filePath: string, dataTypes: DataTypes) => void
  ): void;

  /** Convert file path to OpenAPI route path (e.g. "/users/{id}") */
  getRoutePath(filePath: string): string;

  /** Whether this file should be processed (e.g. route.ts vs any .ts) */
  shouldProcessFile(fileName: string): boolean;
}
