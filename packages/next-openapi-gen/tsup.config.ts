import { defineConfig } from "tsup";

export default defineConfig({
  clean: false,
  dts: true,
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
    "next/index": "src/next/index.ts",
    "react-router/index": "src/react-router/index.ts",
    "vite/index": "src/vite/index.ts",
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
  splitting: false,
  target: "node24",
});
