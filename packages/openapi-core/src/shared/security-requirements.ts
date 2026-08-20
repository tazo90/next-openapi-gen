import type {
  OpenApiSecurityRequirement,
  OpenApiSecurityScheme,
} from "../openapi/document-types.js";
import { DEFAULT_AUTH_PRESET_REPLACEMENTS } from "./spec.js";

export const BUILTIN_AUTH_PRESET_KEYWORDS = ["bearer", "basic", "apikey"] as const;

export type BuiltinAuthPresetKeyword = (typeof BUILTIN_AUTH_PRESET_KEYWORDS)[number];

export const DEFAULT_BUILTIN_SECURITY_SCHEMES: Record<
  BuiltinAuthPresetKeyword,
  OpenApiSecurityScheme
> = {
  bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
  basic: { type: "http", scheme: "basic" },
  apikey: { type: "apiKey", in: "header", name: "X-Api-Key" },
};

const SCHEME_NAME_RE = /^[A-Za-z][A-Za-z0-9._-]*/;

/**
 * Parse `@auth` / `@security` values.
 *
 * Comma separates alternative requirement objects (OR). Semicolon groups
 * schemes in one object (AND). After the first `:`, `,` and `|` are scopes
 * until `;` or the end of the tag.
 */
export function parseSecurityRequirementList(raw: string): OpenApiSecurityRequirement[] {
  const requirements: OpenApiSecurityRequirement[] = [];
  let current: OpenApiSecurityRequirement = {};
  let index = 0;
  const input = raw;

  const skipWhitespace = (): void => {
    while (index < input.length && /\s/.test(input[index] ?? "")) {
      index += 1;
    }
  };

  const pushCurrent = (): void => {
    if (Object.keys(current).length > 0) {
      requirements.push(current);
      current = {};
    }
  };

  while (index < input.length) {
    skipWhitespace();
    if (index >= input.length) {
      break;
    }

    const nameMatch = input.slice(index).match(SCHEME_NAME_RE);
    if (!nameMatch?.[0]) {
      const separatorOffset = input.slice(index).search(/[,;]/);
      index = separatorOffset === -1 ? input.length : index + separatorOffset + 1;
      continue;
    }

    const scheme = nameMatch[0];
    index += scheme.length;
    skipWhitespace();

    let scopes: string[] = [];
    if (input[index] === ":") {
      index += 1;
      const scopeEnd = input.indexOf(";", index);
      const scopesPart = input.slice(index, scopeEnd === -1 ? input.length : scopeEnd);
      scopes = scopesPart
        .split(/[,|]/)
        .map((scope) => scope.trim())
        .filter(Boolean);
      index = scopeEnd === -1 ? input.length : scopeEnd;
    }

    current[scheme] = scopes;
    skipWhitespace();

    if (input[index] === ";") {
      index += 1;
      continue;
    }

    if (input[index] === ",") {
      index += 1;
      pushCurrent();
      continue;
    }

    break;
  }

  pushCurrent();
  return requirements;
}

export function applyAuthPresets(
  requirements: OpenApiSecurityRequirement[],
  presets: Record<string, string> = DEFAULT_AUTH_PRESET_REPLACEMENTS,
): OpenApiSecurityRequirement[] {
  return requirements.map((requirement) =>
    Object.fromEntries(
      Object.entries(requirement).map(([scheme, scopes]) => [
        presets[scheme.toLowerCase()] ?? scheme,
        scopes,
      ]),
    ),
  );
}
