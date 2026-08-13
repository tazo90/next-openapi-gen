import path from "node:path";

import type { SpecEmitter } from "@workspace/openapi-core/core/adapters.js";
import { writeDocumentArtifact } from "@workspace/openapi-core/core/artifact-writer.js";
import { loadYamlOrJson } from "@workspace/openapi-core/core/document-io.js";
import { relativizeDocumentUri } from "@workspace/openapi-core/core/document-uri.js";
import { expandFileGlobs } from "@workspace/openapi-core/core/file-globs.js";
import type { OpenApiDocument } from "@workspace/openapi-core/shared/types.js";

import { applyOverlay } from "./apply.js";
import type { OverlayObject } from "./types.js";
import { getOverlayVersionProcessor, stripUnsupportedOverlayFields } from "./version-processor.js";

export function createOverlayEmitter(): SpecEmitter {
  return {
    kind: "overlay",
    async emit(context) {
      const overlayConfig = context.config.overlay;
      if (!overlayConfig) {
        return [];
      }

      const version = overlayConfig.version ?? "1.1.0";
      const artifacts = [];

      if (overlayConfig.apply?.length) {
        const applyFiles = expandFileGlobs(overlayConfig.apply, context.cwd);
        for (const filePath of applyFiles) {
          const overlay = loadOverlayFile(filePath);
          const finalized = stripUnsupportedOverlayFields(
            overlay,
            version,
            context.diagnostics,
            filePath,
          );
          context.openapiDocument = applyOverlay(context.openapiDocument, finalized);
        }
      }

      if (overlayConfig.generate?.files?.length) {
        const generateFiles = expandFileGlobs(overlayConfig.generate.files, context.cwd);
        const overlay = mergeOverlayFiles(generateFiles, version);
        overlay.extends = relativizeDocumentUri(
          path.join(
            overlayConfig.generate.outputDir ?? context.outputDir,
            overlayConfig.generate.outputFile ?? "overlay.yaml",
          ),
          context.outputFile,
        );
        const finalized = getOverlayVersionProcessor(version).finalize(overlay);
        const outputFile = path.resolve(
          overlayConfig.generate.outputDir ?? context.outputDir,
          overlayConfig.generate.outputFile ?? "overlay.yaml",
        );
        writeDocumentArtifact(outputFile, finalized);
        artifacts.push({ kind: "overlay" as const, path: outputFile });
      }

      return artifacts;
    },
  };
}

function loadOverlayFile(filePath: string): OverlayObject {
  const parsed = loadYamlOrJson(filePath);
  if (!isOverlayObject(parsed)) {
    throw new Error(`Invalid Overlay document: ${filePath}`);
  }
  return parsed;
}

function mergeOverlayFiles(filePaths: string[], version: string): OverlayObject {
  const overlays = filePaths.map(loadOverlayFile);
  const first = overlays[0];
  if (!first) {
    return {
      overlay: version,
      info: { title: "Generated Overlay", version: "1.0.0" },
      actions: [],
    };
  }

  return {
    overlay: version,
    info: first.info,
    actions: overlays.flatMap((overlay) => overlay.actions),
  };
}

function isOverlayObject(value: unknown): value is OverlayObject {
  return (
    typeof value === "object" &&
    value !== null &&
    "actions" in value &&
    Array.isArray((value as OverlayObject).actions)
  );
}

export function applyOpenApiOverlay(
  document: OpenApiDocument,
  overlay: OverlayObject,
): OpenApiDocument {
  return applyOverlay(document, overlay);
}
