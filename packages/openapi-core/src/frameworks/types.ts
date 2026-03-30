import type { DataTypes, ResolvedOpenApiConfig } from "../shared/types.js";

export type DiscoveredRoute = {
  method: string;
  filePath: string;
  routePath: string;
  dataTypes: DataTypes;
};

export interface FrameworkSource {
  readonly config: ResolvedOpenApiConfig;
  getScanRoots(): string[];
  shouldProcessFile(fileName: string): boolean;
  precheckFile(filePath: string): boolean;
  getRoutePath(filePath: string): string;
  processFile(filePath: string, routePath?: string): DiscoveredRoute[];
}
