import { createFileRoute } from "@tanstack/react-router";
import { RedocStandalone } from "redoc";

export const Route = createFileRoute("__NEXT_OPENAPI_GEN_ROUTE_PATH__")({
  component: ApiDocsPage,
});

function ApiDocsPage() {
  return (
    <section>
      <RedocStandalone specUrl="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" />
    </section>
  );
}
