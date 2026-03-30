const RAPIDOC_COMPONENT_DECLARATION = 'const RapiDoc = "rapi-doc" as any;\n\n';

export function normalizeRapidocTemplate(template: string): string {
  return template
    .replace(RAPIDOC_COMPONENT_DECLARATION, "")
    .replaceAll("<RapiDoc", "<rapi-doc")
    .replaceAll("</RapiDoc>", "</rapi-doc>");
}
