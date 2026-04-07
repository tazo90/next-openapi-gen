import fs from "node:fs";
import path from "node:path";

import { AppRouterStrategy } from "../../routes/app-router-strategy.js";
import { PagesRouterStrategy } from "../../routes/pages-router-strategy.js";
import type { GenerationPerformanceProfile } from "@workspace/openapi-core/core/performance.js";
import { FrameworkKind, type ResolvedOpenApiConfig } from "@workspace/openapi-core/shared/types.js";
import type { FrameworkSource } from "@workspace/openapi-core/frameworks/types.js";

class NextFrameworkSource implements FrameworkSource {
  private readonly strategy;

  constructor(
    public readonly config: ResolvedOpenApiConfig,
    performanceProfile?: GenerationPerformanceProfile,
  ) {
    this.strategy =
      config.framework.kind === FrameworkKind.Nextjs && config.framework.router === "pages"
        ? new PagesRouterStrategy(config, performanceProfile)
        : new AppRouterStrategy(config, performanceProfile);
  }

  public getScanRoots(): string[] {
    const roots = [this.config.apiDir];
    const resolvedApiDir = path.resolve(this.config.apiDir);
    const candidateRoots = [
      path.join(process.cwd(), "src", "app", "api"),
      path.join(process.cwd(), "app", "api"),
    ];

    candidateRoots.forEach((candidateRoot) => {
      const resolvedCandidate = path.resolve(candidateRoot);
      if (
        fs.existsSync(candidateRoot) &&
        resolvedCandidate !== resolvedApiDir &&
        !resolvedApiDir.startsWith(resolvedCandidate + path.sep) &&
        !roots.includes(candidateRoot)
      ) {
        roots.push(candidateRoot);
      }
    });

    return roots;
  }

  public shouldProcessFile(fileName: string): boolean {
    return this.strategy.shouldProcessFile(fileName);
  }

  public getRoutePath(filePath: string): string {
    return this.strategy.getRoutePath(filePath);
  }

  public precheckFile(filePath: string): boolean {
    return this.strategy.precheckFile(filePath);
  }

  public processFile(filePath: string, routePath = this.strategy.getRoutePath(filePath)) {
    const routes: ReturnType<FrameworkSource["processFile"]> = [];

    this.strategy.processFile(filePath, (method, processedFilePath, dataTypes) => {
      routes.push({
        method,
        filePath: processedFilePath,
        routePath,
        dataTypes,
      });
    });

    return routes;
  }
}

export function createNextFrameworkSource(
  config: ResolvedOpenApiConfig,
  performanceProfile?: GenerationPerformanceProfile,
): NextFrameworkSource {
  return new NextFrameworkSource(config, performanceProfile);
}
