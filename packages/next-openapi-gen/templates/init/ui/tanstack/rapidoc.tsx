import { createFileRoute } from "@tanstack/react-router";

import "rapidoc";

const RapiDoc = "rapi-doc" as any;

export const Route = createFileRoute("__NEXT_OPENAPI_GEN_ROUTE_PATH__")({
  component: ApiDocsPage,
});

function ApiDocsPage() {
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
