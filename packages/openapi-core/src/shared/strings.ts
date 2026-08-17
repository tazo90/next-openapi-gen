export function capitalize(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function resolveAnnotationTypeName(primary?: string, fallback?: string): string | undefined {
  const normalizedPrimary = primary?.trim();
  if (normalizedPrimary) {
    return normalizedPrimary;
  }

  const normalizedFallback = fallback?.trim();
  return normalizedFallback || undefined;
}

export function extractPathParameters(routePath: string): string[] {
  const paramRegex = /{([^}]+)}/g;
  const params: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = paramRegex.exec(routePath)) !== null) {
    if (match[1]) {
      params.push(match[1]);
    }
  }

  return params;
}

export function getOperationId(routePath: string, method: string): string {
  const operation = routePath.replaceAll(/\//g, "-").replace(/^-/, "");
  return `${method}-${operation}`;
}

export function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toCamelCase(value: string): string {
  const normalized = value.replaceAll(/[^A-Za-z0-9]+/g, " ").trim();
  if (!normalized) {
    return "query";
  }

  return normalized
    .split(/\s+/)
    .map((segment, index) => {
      const lower = segment.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}
