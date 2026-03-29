import { createFileRoute } from "@tanstack/react-router";
import { API } from "@stoplight/elements";
import "@stoplight/elements/styles.min.css";

export const Route = createFileRoute("__NEXT_OPENAPI_GEN_ROUTE_PATH__")({
  component: ApiDocsPage,
});

function ApiDocsPage() {
  return (
    <section style={{ height: "100vh" }}>
      <API apiDescriptionUrl="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" />
    </section>
  );
}
