export const rapidocDeps = ["rapidoc"];
export const rapidocDevDeps = [];

export function RapidocUI(outputFile: string) {
  return `
"use client";

import "rapidoc";

export default function ApiDocsPage() {
  return (
    <section style={{ height: "100vh" }}>
      <rapi-doc
        spec-url="${outputFile}"
        render-style="read"
        style={{ height: "100vh", width: "100%" }}
      ></rapi-doc>
    </section>
  );
}
`;
}
