import fs from "fs";
import path from "path";

import { beforeEach, describe, expect, it } from "vitest";

import { SchemaProcessor } from "@next-openapi-gen/schema/typescript/schema-processor.js";

describe("SchemaProcessor import resolution", () => {
  let processor: SchemaProcessor;
  const fixturesDir = path.join(process.cwd(), "tests", "fixtures", "import-resolution");

  beforeEach(() => {
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(fixturesDir, "helper.ts"),
      `
export interface User {
  name: string;
  email: string;
}

export async function getUser(id: number): Promise<User> {
  return { name: "John", email: "john@example.com" };
}
      `.trim(),
    );

    fs.writeFileSync(
      path.join(fixturesDir, "types.ts"),
      `
import { getUser } from "./helper";

export type UserResponse = Awaited<ReturnType<typeof getUser>>;
      `.trim(),
    );

    processor = new SchemaProcessor(fixturesDir, "typescript");
  });

  it("resolves imported functions for ReturnType", () => {
    const schema = processor.findSchemaDefinition("UserResponse", "");

    expect(schema).toBeDefined();
    expect(schema.type).toBe("object");
    expect(schema.properties?.name).toEqual({ type: "string" });
    expect(schema.properties?.email).toEqual({ type: "string" });
  });
});
