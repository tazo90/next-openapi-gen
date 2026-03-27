import fs from "node:fs";
import path from "node:path";

import { AppRouterStrategy } from "../../routes/app-router-strategy.js";
import { PagesRouterStrategy } from "../../routes/pages-router-strategy.js";
import type { ResolvedOpenApiConfig } from "../../shared/types.js";
import type { FrameworkAdapter } from "../types.js";

export class NextFrameworkAdapter implements FrameworkAdapter {
  private readonly strategy;

  constructor(public readonly config: ResolvedOpenApiConfig) {
    this.strategy =
      config.framework.kind === "next" && config.framework.router === "pages"
        ? new PagesRouterStrategy(config)
        : new AppRouterStrategy(config);
  }

  public getScanRoots(): string[] {
    const roots = [this.config.apiDir];
    const candidateRoots = [
      path.join(process.cwd(), "src", "app", "api"),
      path.join(process.cwd(), "app", "api"),
    ];

    candidateRoots.forEach((candidateRoot) => {
      if (
        fs.existsSync(candidateRoot) &&
        path.resolve(candidateRoot) !== path.resolve(this.config.apiDir) &&
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

  public processFile(filePath: string) {
    const routes: ReturnType<FrameworkAdapter["processFile"]> = [];

    this.strategy.processFile(filePath, (method, processedFilePath, dataTypes) => {
      routes.push({
        method,
        filePath: processedFilePath,
        routePath: this.strategy.getRoutePath(processedFilePath),
        dataTypes,
      });
    });

    return routes;
  }
}

export function createNextFrameworkAdapter(config: ResolvedOpenApiConfig): NextFrameworkAdapter {
  return new NextFrameworkAdapter(config);
}
