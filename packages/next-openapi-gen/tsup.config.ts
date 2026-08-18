import { defineConfig } from "tsup";

export default defineConfig({
  clean: false,
  dts: {
    compilerOptions: {
      ignoreDeprecations: "6.0",
    },
  },
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
    "next/index": "src/next/index.ts",
    "react-router/index": "src/react-router/index.ts",
    "vite/index": "src/vite/index.ts",
    "remix/index": "src/remix/index.ts",
    "sveltekit/index": "src/sveltekit/index.ts",
    "nuxt/index": "src/nuxt/index.ts",
    "astro/index": "src/astro/index.ts",
    "hono/index": "src/hono/index.ts",
    "express/index": "src/express/index.ts",
  },
  external: [
    "@babel/parser",
    "@babel/traverse",
    "@babel/types",
    "commander",
    "fs-extra",
    "js-yaml",
    "ora",
    "typescript",
  ],
  format: ["esm"],
  noExternal: [/^@workspace\/openapi-/],
  sourcemap: false,
  splitting: true,
  target: "node24",
});
