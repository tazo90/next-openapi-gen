export type JsonPathMatch = {
  value: unknown;
  parent: Record<string, unknown> | unknown[] | null;
  key: string | number | null;
};

type PathSegment =
  | { kind: "child"; name: string }
  | { kind: "index"; index: number }
  | { kind: "wildcard" }
  | { kind: "slice"; start?: number | undefined; end?: number | undefined }
  | { kind: "descendant"; name?: string | undefined; wildcard?: boolean | undefined }
  | { kind: "filter"; expression: string };

export function queryJsonPath(root: unknown, path: string): JsonPathMatch[] {
  const segments = parseJsonPath(path);
  let matches: JsonPathMatch[] = [{ value: root, parent: null, key: null }];

  for (const segment of segments) {
    matches = matches.flatMap((match) => applySegment(match, segment));
  }

  return matches;
}

function parseJsonPath(path: string): PathSegment[] {
  const trimmed = path.trim();
  if (!trimmed.startsWith("$")) {
    throw new Error(`JSONPath must start with $: ${path}`);
  }

  const segments: PathSegment[] = [];
  let index = 1;

  while (index < trimmed.length) {
    const current = trimmed[index];
    if (current === ".") {
      if (trimmed[index + 1] === ".") {
        index += 2;
        if (trimmed[index] === "*") {
          segments.push({ kind: "descendant", wildcard: true });
          index += 1;
          continue;
        }
        if (trimmed[index] === "[") {
          const parsed = parseBracket(trimmed, index);
          if (parsed.segment.kind === "child") {
            segments.push({ kind: "descendant", name: parsed.segment.name });
          } else if (parsed.segment.kind === "wildcard") {
            segments.push({ kind: "descendant", wildcard: true });
          } else {
            segments.push(parsed.segment);
          }
          index = parsed.nextIndex;
          continue;
        }
        const name = readIdentifier(trimmed, index);
        segments.push({ kind: "descendant", name: name.value });
        index = name.nextIndex;
        continue;
      }

      index += 1;
      if (trimmed[index] === "*") {
        segments.push({ kind: "wildcard" });
        index += 1;
        continue;
      }
      const name = readIdentifier(trimmed, index);
      segments.push({ kind: "child", name: name.value });
      index = name.nextIndex;
      continue;
    }

    if (current === "[") {
      const parsed = parseBracket(trimmed, index);
      segments.push(parsed.segment);
      index = parsed.nextIndex;
      continue;
    }

    throw new Error(`Unexpected JSONPath token at ${index}: ${path}`);
  }

  return segments;
}

function parseBracket(path: string, start: number): { segment: PathSegment; nextIndex: number } {
  if (path[start] !== "[") {
    throw new Error(`Expected '[' at ${start}`);
  }

  let index = start + 1;
  while (path[index] === " ") {
    index += 1;
  }

  if (path[index] === "*") {
    index += 1;
    while (path[index] === " ") {
      index += 1;
    }
    if (path[index] !== "]") {
      throw new Error(`Expected ']' after wildcard in ${path}`);
    }
    return { segment: { kind: "wildcard" }, nextIndex: index + 1 };
  }

  if (path[index] === "?") {
    const end = path.indexOf("]", index);
    if (end === -1) {
      throw new Error(`Unclosed filter in ${path}`);
    }
    return {
      segment: { kind: "filter", expression: path.slice(index + 1, end).trim() },
      nextIndex: end + 1,
    };
  }

  if (path[index] === "'" || path[index] === '"') {
    const quote = path[index];
    index += 1;
    let name = "";
    while (index < path.length && path[index] !== quote) {
      if (path[index] === "\\") {
        index += 1;
      }
      name += path[index];
      index += 1;
    }
    index += 1;
    while (path[index] === " ") {
      index += 1;
    }
    if (path[index] !== "]") {
      throw new Error(`Expected ']' after quoted name in ${path}`);
    }
    return { segment: { kind: "child", name }, nextIndex: index + 1 };
  }

  const sliceMatch = path.slice(index).match(/^(-?\d+)?\s*:\s*(-?\d+)?\s*]/);
  if (sliceMatch) {
    return {
      segment: {
        kind: "slice",
        start: sliceMatch[1] ? Number(sliceMatch[1]) : undefined,
        end: sliceMatch[2] ? Number(sliceMatch[2]) : undefined,
      },
      nextIndex: index + sliceMatch[0].length,
    };
  }

  const numberMatch = path.slice(index).match(/^-?\d+/);
  if (numberMatch) {
    index += numberMatch[0].length;
    while (path[index] === " ") {
      index += 1;
    }
    if (path[index] !== "]") {
      throw new Error(`Expected ']' after index in ${path}`);
    }
    return { segment: { kind: "index", index: Number(numberMatch[0]) }, nextIndex: index + 1 };
  }

  throw new Error(`Unsupported JSONPath bracket selector in ${path}`);
}

function readIdentifier(path: string, start: number): { value: string; nextIndex: number } {
  const match = path.slice(start).match(/^[A-Za-z_][\w-]*/);
  if (!match) {
    throw new Error(`Expected identifier at ${start} in ${path}`);
  }
  return { value: match[0], nextIndex: start + match[0].length };
}

function applySegment(match: JsonPathMatch, segment: PathSegment): JsonPathMatch[] {
  switch (segment.kind) {
    case "child":
      return childMatches(match.value, segment.name);
    case "index":
      return indexMatches(match.value, segment.index);
    case "wildcard":
      return wildcardMatches(match.value);
    case "slice":
      return sliceMatches(match.value, segment.start, segment.end);
    case "descendant":
      return descendantMatches(match.value, segment);
    case "filter":
      return filterMatches(match.value, segment.expression);
    default: {
      const exhaustive: never = segment;
      throw new Error(`Unhandled JSONPath segment ${(exhaustive as PathSegment).kind}`);
    }
  }
}

function childMatches(value: unknown, name: string): JsonPathMatch[] {
  if (!isRecord(value) || !(name in value)) {
    return [];
  }
  return [{ value: value[name], parent: value, key: name }];
}

function indexMatches(value: unknown, index: number): JsonPathMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const resolved = index < 0 ? value.length + index : index;
  if (resolved < 0 || resolved >= value.length) {
    return [];
  }
  return [{ value: value[resolved], parent: value, key: resolved }];
}

function wildcardMatches(value: unknown): JsonPathMatch[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({ value: entry, parent: value, key: index }));
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([key, entry]) => ({
      value: entry,
      parent: value,
      key,
    }));
  }
  return [];
}

function sliceMatches(value: unknown, start?: number, end?: number): JsonPathMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const resolvedStart = start === undefined ? 0 : start < 0 ? value.length + start : start;
  const resolvedEnd = end === undefined ? value.length : end < 0 ? value.length + end : end;
  return value.slice(Math.max(0, resolvedStart), Math.max(0, resolvedEnd)).map((entry, offset) => ({
    value: entry,
    parent: value,
    key: Math.max(0, resolvedStart) + offset,
  }));
}

function descendantMatches(
  value: unknown,
  segment: Extract<PathSegment, { kind: "descendant" }>,
): JsonPathMatch[] {
  const matches: JsonPathMatch[] = [];
  walk(value, null, null, (current, parent, key) => {
    if (parent === null) {
      return;
    }
    if (segment.wildcard) {
      matches.push({ value: current, parent, key });
      return;
    }
    if (segment.name && key === segment.name) {
      matches.push({ value: current, parent, key });
    }
  });
  return matches;
}

function filterMatches(value: unknown, expression: string): JsonPathMatch[] {
  return wildcardMatches(value).filter((match) => evaluateFilter(match.value, expression));
}

function evaluateFilter(value: unknown, expression: string): boolean {
  const normalized = expression.replace(/^\(|\)$/g, "").trim();
  const comparison = normalized.match(/^@(?:\.(\w+)|\[(?:'|")([^'"]+)(?:'|")\])\s*(==|!=)\s*(.+)$/);
  if (!comparison) {
    if (normalized === "@") {
      return value != null;
    }
    return false;
  }

  const property = comparison[1] ?? comparison[2];
  const operator = comparison[3];
  const rawExpected = comparison[4]?.trim();
  const actual = isRecord(value) && property ? value[property] : undefined;
  const expected = parseFilterLiteral(rawExpected ?? "");

  if (operator === "==") {
    return actual === expected;
  }
  return actual !== expected;
}

function parseFilterLiteral(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  return raw;
}

function walk(
  value: unknown,
  parent: Record<string, unknown> | unknown[] | null,
  key: string | number | null,
  visit: (
    current: unknown,
    parent: Record<string, unknown> | unknown[] | null,
    key: string | number | null,
  ) => void,
): void {
  visit(value, parent, key);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, value, index, visit));
    return;
  }
  if (isRecord(value)) {
    for (const [childKey, child] of Object.entries(value)) {
      walk(child, value, childKey, visit);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
