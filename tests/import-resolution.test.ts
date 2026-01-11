import { describe, it, expect, beforeEach } from "vitest";
import { SchemaProcessor } from "../src/lib/schema-processor.js";
import path from "path";
import fs from "fs";

describe("SchemaProcessor - Import Resolution", () => {
  let processor: SchemaProcessor;
  const fixturesDir = path.join(process.cwd(), "tests", "fixtures", "import-resolution");

  beforeEach(() => {
    // Create fixture files
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Create helper.ts with a function
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
      `.trim()
    );

    // Create types.ts that imports from helper.ts
    fs.writeFileSync(
      path.join(fixturesDir, "types.ts"),
      `
import { getUser } from "./helper";

export type UserResponse = Awaited<ReturnType<typeof getUser>>;
      `.trim()
    );

    processor = new SchemaProcessor(fixturesDir, "typescript");
  });

  it("should resolve imported function for ReturnType", () => {
    const schema = processor.findSchemaDefinition("UserResponse", "");

    expect(schema).toBeDefined();
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.properties?.name).toEqual({ type: "string" });
    expect(schema.properties?.email).toEqual({ type: "string" });
  });
});
