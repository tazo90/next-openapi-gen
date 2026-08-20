import type {
  Diagnostic,
  OpenApiDocument,
  OpenApiTag,
  OpenApiTemplate,
  ResolvedOpenApiConfig,
} from "../../shared/types.js";

export type GeneratedArtifact = {
  kind: "spec" | "docs" | "sdk" | "arazzo" | "overlay";
  path: string;
};

export type ClientSdkEmitterConfig = {
  name?: string | undefined;
  command: string;
  args?: string[] | undefined;
  outputDir?: string | undefined;
  enabled?: boolean | undefined;
};

export type GeneratorWatchConfig = {
  enabled?: boolean | undefined;
  debounceMs?: number | undefined;
};

export type DocsEmitterConfig = {
  enabled?: boolean | undefined;
  framework?:
    | "next"
    | "vite"
    | "react-router"
    | "remix"
    | "sveltekit"
    | "nuxt"
    | "astro"
    | "hono"
    | "express"
    | undefined;
};

export type GeneratorHooks = {
  configLoaded?:
    | ((context: { config: ResolvedOpenApiConfig; configPath?: string | undefined }) => void)
    | undefined;
  routesDiscovered?:
    | ((context: {
        config: ResolvedOpenApiConfig;
        paths: Record<string, unknown>;
        tags: OpenApiTag[];
        diagnostics: Diagnostic[];
      }) => void)
    | undefined;
  documentBuilt?:
    | ((context: {
        config: ResolvedOpenApiConfig;
        document: OpenApiDocument;
        diagnostics: Diagnostic[];
      }) => void)
    | undefined;
  artifactsWritten?:
    | ((context: { config: ResolvedOpenApiConfig; artifacts: GeneratedArtifact[] }) => void)
    | undefined;
};

export type NextOpenApiConfigFile = OpenApiTemplate & {
  generatedDir?: string | undefined;
  watch?: GeneratorWatchConfig | undefined;
  clientSdk?: ClientSdkEmitterConfig[] | undefined;
  docs?: DocsEmitterConfig | undefined;
  hooks?: GeneratorHooks | undefined;
};

export type LoadedConfigFile = {
  config: NextOpenApiConfigFile;
  configPath?: string | undefined;
};
