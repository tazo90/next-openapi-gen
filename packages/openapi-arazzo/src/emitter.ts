import path from "node:path";

import type { SpecEmitter } from "@workspace/openapi-core/core/adapters.js";
import { writeDocumentArtifact } from "@workspace/openapi-core/core/artifact-writer.js";
import { loadYamlOrJson } from "@workspace/openapi-core/core/document-io.js";
import {
  relativizeDocumentUri,
  resolveDocumentSelf,
} from "@workspace/openapi-core/core/document-uri.js";
import { expandFileGlobs } from "@workspace/openapi-core/core/file-globs.js";

import { compileArazzoDescription } from "./compile.js";
import type { ArazzoDescription } from "./types.js";
import { finalizeArazzoDocument } from "./version-processor.js";

export function createArazzoEmitter(): SpecEmitter {
  return {
    kind: "arazzo",
    async emit(context) {
      const arazzoConfig = context.config.arazzo;
      if (!arazzoConfig?.files?.length) {
        return [];
      }

      const version = arazzoConfig.version ?? "1.1.0";
      const files = expandFileGlobs(arazzoConfig.files, context.cwd);
      const merged = mergeArazzoFiles(files, version);
      const outputFile = path.resolve(
        arazzoConfig.outputDir ?? context.outputDir,
        arazzoConfig.outputFile ?? "arazzo.yaml",
      );

      merged.sourceDescriptions = merged.sourceDescriptions.length
        ? merged.sourceDescriptions.map((source) =>
            source.type === "openapi" || !source.type
              ? {
                  ...source,
                  type: "openapi",
                  url: source.url || relativizeDocumentUri(outputFile, context.outputFile),
                }
              : source,
          )
        : [
            {
              name: "openapi",
              type: "openapi",
              url: relativizeDocumentUri(outputFile, context.outputFile),
            },
          ];

      if (version.startsWith("1.1")) {
        merged.$self = resolveDocumentSelf(merged.$self, outputFile);
      }

      const compiled = compileArazzoDescription(merged, context.ir, context.diagnostics, files[0]);
      const finalized = finalizeArazzoDocument(compiled, version, context.diagnostics, files[0]);
      writeDocumentArtifact(outputFile, finalized);
      return [{ kind: "arazzo", path: outputFile }];
    },
  };
}

function mergeArazzoFiles(filePaths: string[], version: string): ArazzoDescription {
  const documents = filePaths.map(loadArazzoFile);
  const first = documents[0];
  if (!first) {
    return {
      arazzo: version,
      info: { title: "Generated workflows", version: "1.0.0" },
      sourceDescriptions: [],
      workflows: [],
    };
  }

  return {
    arazzo: version,
    info: first.info,
    sourceDescriptions: documents.flatMap((document) => document.sourceDescriptions ?? []),
    workflows: documents.flatMap((document) => document.workflows ?? []),
    components: documents.reduce<Record<string, unknown>>((components, document) => {
      return document.components ? { ...components, ...document.components } : components;
    }, {}),
  };
}

function loadArazzoFile(filePath: string): ArazzoDescription {
  const parsed = loadYamlOrJson(filePath);
  if (!isArazzoDescription(parsed)) {
    throw new Error(`Invalid Arazzo document: ${filePath}`);
  }
  return parsed;
}

function isArazzoDescription(value: unknown): value is ArazzoDescription {
  return (
    typeof value === "object" &&
    value !== null &&
    "workflows" in value &&
    Array.isArray((value as ArazzoDescription).workflows)
  );
}
