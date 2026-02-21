import { describe, it, expect } from "vitest";
import { ZodSchemaConverter } from "../src/lib/zod-converter.js";
import path from "path";
import fs from "fs";

describe("Optional vs Nullable vs Nullish handling (GitHub #84)", () => {
  const testDir = path.join(process.cwd(), "tests", "fixtures");
  const testFile = path.join(testDir, "optional-nullable-test.ts");

  function setup(schema: string) {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(testFile, schema.trim());
  }

  function cleanup() {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  }

  it("should distinguish optional, nullable, and nullish", () => {
    setup(`
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

      expect(schema).toBeDefined();
      expect(schema!.type).toBe("object");

      // id: required, not nullable
      expect(schema!.properties!.id.type).toBe("string");
      expect(schema!.properties!.id.nullable).toBeUndefined();
      expect(schema!.required).toContain("id");

      // username (.optional()): not required, NOT nullable
      expect(schema!.properties!.username.type).toBe("string");
      expect(schema!.properties!.username.nullable).toBeUndefined();
      expect(schema!.required).not.toContain("username");

      // firstName (.nullable()): required, nullable
      expect(schema!.properties!.firstName.type).toBe("string");
      expect(schema!.properties!.firstName.nullable).toBe(true);
      expect(schema!.required).toContain("firstName");

      // middleName (.nullish()): not required, nullable
      expect(schema!.properties!.middleName.type).toBe("string");
      expect(schema!.properties!.middleName.nullable).toBe(true);
      expect(schema!.required).not.toContain("middleName");
    } finally {
      cleanup();
    }
  });

  it("should handle optional with validation chains", () => {
    setup(`
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

      expect(schema).toBeDefined();

      // email: required, not nullable
      expect(schema!.required).toContain("email");
      expect(schema!.properties!.email.nullable).toBeUndefined();

      // nickname (.optional()): not required, NOT nullable
      expect(schema!.required).not.toContain("nickname");
      expect(schema!.properties!.nickname.nullable).toBeUndefined();
      expect(schema!.properties!.nickname.minLength).toBe(3);

      // bio (.nullable()): required, nullable
      expect(schema!.required).toContain("bio");
      expect(schema!.properties!.bio.nullable).toBe(true);
      expect(schema!.properties!.bio.maxLength).toBe(500);
    } finally {
      cleanup();
    }
  });

  it("should handle nested object with optional at object level", () => {
    setup(`
import { z } from "zod";

export const WrapperSchema = z.object({
  id: z.string().describe("ID"),
  user: z.object({
    name: z.string().describe("Name"),
  }).optional().describe("User"),
});
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("WrapperSchema");

      expect(schema).toBeDefined();
      expect(schema!.required).toContain("id");
      expect(schema!.required).not.toContain("user");
      // optional object should NOT have nullable
      expect(schema!.properties!.user.nullable).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("should handle nullable combined with optional (nullish-like)", () => {
    setup(`
import { z } from "zod";

export const MixedSchema = z.object({
  a: z.string().nullable().optional().describe("Nullable then optional"),
  b: z.string().optional().nullable().describe("Optional then nullable"),
});
    `);

    try {
      const converter = new ZodSchemaConverter(testDir);
      const schema = converter.convertZodSchemaToOpenApi("MixedSchema");

      expect(schema).toBeDefined();

      // Both should be: not required, nullable (equivalent to nullish)
      expect(schema!.required || []).not.toContain("a");
      expect(schema!.required || []).not.toContain("b");
      expect(schema!.properties!.a.nullable).toBe(true);
      expect(schema!.properties!.b.nullable).toBe(true);
    } finally {
      cleanup();
    }
  });
});
