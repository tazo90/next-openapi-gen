import { describe, expect, it } from "vitest";

import { processImports } from "@next-openapi-gen/schema/zod/import-processor.js";
import { parseTypeScriptFile } from "@next-openapi-gen/shared/utils.js";

describe("processImports", () => {
  it("collects imported modules and drizzle-zod aliases", () => {
    const ast = parseTypeScriptFile(`
      import { z } from "zod";
      import foo from "./foo";
      import { createInsertSchema, createSelectSchema as makeSelect } from "drizzle-zod";
    `);

    expect(processImports(ast)).toEqual({
      importedModules: {
        z: "zod",
        foo: "./foo",
        createInsertSchema: "drizzle-zod",
        makeSelect: "drizzle-zod",
      },
      drizzleZodImports: ["createInsertSchema", "makeSelect"],
    });
  });
});
