"use client";

import "rapidoc";

const RapiDoc = "rapi-doc" as any;

export default function ApiDocsPage() {
  return (
    <section style={{ height: "100vh" }}>
      <RapiDoc
        spec-url="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__"
        render-style="read"
        style={{ height: "100vh", width: "100%" }}
      ></RapiDoc>
    </section>
  );
}
