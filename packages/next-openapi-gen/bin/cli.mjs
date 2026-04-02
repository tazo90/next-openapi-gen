#!/usr/bin/env node

import fs from "node:fs";

const cliModuleUrl = new URL("../dist/cli.js", import.meta.url);

if (!fs.existsSync(cliModuleUrl)) {
  process.stderr.write(
    "The next-openapi-gen CLI has not been built yet. Run `pnpm exec turbo run build --filter=next-openapi-gen...` first.\n",
  );
  process.exit(1);
}

await import(cliModuleUrl.href);
