import { describe, expect, it } from "vitest";

import {
  backportExtension,
  isRegisteredFormat,
  isRegisteredTagKind,
  mediaTypeGroup,
  moveFieldToExtension,
  OAI_REGISTRY_SNAPSHOT_DATE,
  promoteExtensionField,
} from "@workspace/openapi-core/openapi/registries/index.js";

describe("OAI registries", () => {
  it("snapshots registered vocabulary from 2026-08-13", () => {
    expect(OAI_REGISTRY_SNAPSHOT_DATE).toBe("2026-08-13");
    expect(isRegisteredFormat("email")).toBe(true);
    expect(isRegisteredFormat("ipv4-cidr")).toBe(true);
    expect(isRegisteredFormat("cuid")).toBe(false);
    expect(isRegisteredTagKind("nav")).toBe(true);
    expect(isRegisteredTagKind("custom")).toBe(false);
    expect(mediaTypeGroup("application/jsonl")).toBe("sequential-json");
    expect(mediaTypeGroup("text/event-stream")).toBe("sse");
    expect(mediaTypeGroup("application/json")).toBe("json");
  });

  it("backports native fields onto registered extensions for older OAS versions", () => {
    expect(backportExtension("$self", "3.1")).toBe("x-oai-$self");
    expect(backportExtension("$self", "3.2")).toBeNull();
    expect(backportExtension("propertyNames", "3.0")).toBe("x-jsonschema-propertyNames");
    expect(backportExtension("dependentRequired", "3.0")).toBeNull();
  });

  it("moves a field only when a registered extension exists for the target version", () => {
    const document: Record<string, unknown> = { $self: "https://example.com/openapi.json" };
    moveFieldToExtension(document, "$self", "3.1");
    expect(document).toEqual({ "x-oai-$self": "https://example.com/openapi.json" });

    const native: Record<string, unknown> = { $self: "https://example.com/openapi.json" };
    moveFieldToExtension(native, "$self", "3.2");
    expect(native).toEqual({ $self: "https://example.com/openapi.json" });
  });

  it("promotes registered x-oai extensions back to native fields on 3.2", () => {
    const document: Record<string, unknown> = {
      "x-oai-$self": "https://example.com/openapi.json",
    };
    promoteExtensionField(document, "$self", "3.2");
    expect(document).toEqual({ $self: "https://example.com/openapi.json" });
  });
});
