import type { ParserOptions } from "@babel/parser";
import { parse } from "@babel/parser";
import type * as t from "@babel/types";

const DEFAULT_PARSER_OPTIONS: ParserOptions = {
  sourceType: "module",
  plugins: ["typescript", "jsx", "decorators-legacy"],
};

export function parseTypeScriptFile(content: string, options?: Partial<ParserOptions>): t.File {
  return parse(content, {
    ...DEFAULT_PARSER_OPTIONS,
    ...options,
  });
}
