import path from "path";

import { beforeEach, describe, expect, it } from "vitest";

import { SchemaProcessor } from "@workspace/openapi-core/schema/typescript/schema-processor.js";

const DATE_TIME_SCHEMA = { type: "string", format: "date-time" };

describe("Date properties resolved through a TypeScript checker", () => {
  let processor: SchemaProcessor;

  beforeEach(() => {
    processor = new SchemaProcessor(
      path.join(process.cwd(), "tests", "fixtures", "checker-date"),
      "typescript",
    );
  });

  it("emits a date-time string instead of expanding the Date prototype", () => {
    const schema = processor.findSchemaDefinition("AuditedRecord", "");

    expect(schema.properties?.createdAt).toEqual(DATE_TIME_SCHEMA);
  });

  it("emits date-time for every Date property, not just the first", () => {
    const schema = processor.findSchemaDefinition("AuditedRecord", "");

    // The recursion guard records resolved types by name, so a naive fix that runs
    // after it leaves the second `Date` as a bare `{ type: "object" }`.
    expect(schema.properties?.updatedAt).toEqual(DATE_TIME_SCHEMA);
  });

  it("does not leak Date prototype methods into properties", () => {
    const schema = processor.findSchemaDefinition("AuditedRecord", "");
    const createdAt = schema.properties?.createdAt;

    expect(createdAt?.properties).toBeUndefined();
    expect(createdAt?.required).toBeUndefined();
    expect(JSON.stringify(schema)).not.toContain("toISOString");
  });

  it("resolves sibling Date properties declared across the intersection", () => {
    const schema = processor.findSchemaDefinition("PublishedAt", "");

    expect(schema.properties?.publishedAt).toEqual(DATE_TIME_SCHEMA);
    expect(schema.properties?.createdAt).toEqual(DATE_TIME_SCHEMA);
  });

  it("agrees with the Babel AST path for a plain alias", () => {
    const schema = processor.findSchemaDefinition("PlainAudit", "");

    expect(schema.properties?.createdAt).toEqual(DATE_TIME_SCHEMA);
  });
});
