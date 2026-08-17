import { describe, expect, it } from "vitest";

import { isDateType } from "@workspace/openapi-core/shared/typescript-adapter.js";

describe("isDateType", () => {
  it("recognizes Date from the type symbol name", () => {
    expect(
      isDateType({ getSymbol: () => ({ name: "Date" }) }, { typeToString: () => "never" }),
    ).toBe(true);
  });

  it("falls back to the checker string when the symbol is missing", () => {
    expect(isDateType({ getSymbol: () => undefined }, { typeToString: () => "Date" })).toBe(true);
    expect(isDateType({}, { typeToString: () => "string" })).toBe(false);
  });

  it("treats checker failures as not Date", () => {
    expect(
      isDateType(
        {},
        {
          typeToString: () => {
            throw new Error("unavailable");
          },
        },
      ),
    ).toBe(false);
  });
});
