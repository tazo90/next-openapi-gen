import { describe, expect, it } from "vitest";

import { processImports } from "@workspace/openapi-core/schema/zod/import-processor.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

describe("processImports", () => {
  it("collects imported modules and drizzle-zod aliases", () => {
    const ast = parseTypeScriptFile(`
      import { z } from "zod";
      import foo from "./foo";
      import drizzleDefault from "drizzle-zod";
      import { createInsertSchema, createSelectSchema as makeSelect } from "drizzle-zod";
      import * as helpers from "./helpers";
    `);

    expect(processImports(ast)).toEqual({
      importedModules: {
        z: "zod",
        foo: "./foo",
        drizzleDefault: "drizzle-zod",
        createInsertSchema: "drizzle-zod",
        makeSelect: "drizzle-zod",
      },
      drizzleZodImports: ["drizzleDefault", "createInsertSchema", "makeSelect"],
      zodLocalName: "z",
    });
  });

  it("captures aliased z import local names", () => {
    const ast = parseTypeScriptFile(`
      import { z as zod } from "zod";
    `);
    expect(processImports(ast).zodLocalName).toBe("zod");
  });

  it("captures namespace import local names", () => {
    const ast = parseTypeScriptFile(`
      import * as myZ from "zod";
    `);
    expect(processImports(ast).zodLocalName).toBe("myZ");
  });
});
