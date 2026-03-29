import fs from "fs";
import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

function setup(schema: string) {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-optional-nullable-"));
  fs.writeFileSync(path.join(testDir, "schema.ts"), schema.trim());
  return testDir;
}

describe("Zod nullability regressions", () => {
  it("distinguishes optional, nullable, and nullish properties", () => {
    const testDir = setup(`
      import { z } from "zod";

      export const UserSchema = z.object({
        id: z.string().describe("ID"),
        username: z.string().optional().describe("Username"),
        firstName: z.string().nullable().describe("First name"),
        middleName: z.string().nullish().describe("Middle name"),
      });
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("UserSchema");

      expect(schema?.required).toContain("id");
      expect(schema?.required).not.toContain("username");
      expect(schema?.required).toContain("firstName");
      expect(schema?.required).not.toContain("middleName");
      expect(schema?.properties?.firstName?.nullable).toBe(true);
      expect(schema?.properties?.middleName?.nullable).toBe(true);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("preserves optionality and nullability through validation chains", () => {
    const testDir = setup(`
      import { z } from "zod";

      export const ProfileSchema = z.object({
        email: z.string().email().describe("Email"),
        nickname: z.string().min(3).max(20).optional().describe("Nickname"),
        bio: z.string().max(500).nullable().describe("Bio"),
      });
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("ProfileSchema");

      expect(schema?.required).toContain("email");
      expect(schema?.required).not.toContain("nickname");
      expect(schema?.required).toContain("bio");
      expect(schema?.properties?.nickname?.minLength).toBe(3);
      expect(schema?.properties?.bio?.nullable).toBe(true);
      expect(schema?.properties?.bio?.maxLength).toBe(500);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
