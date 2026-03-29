import "swagger-ui-react/swagger-ui.css";

import { createFileRoute } from "@tanstack/react-router";
import SwaggerUI from "swagger-ui-react";

export const Route = createFileRoute("__NEXT_OPENAPI_GEN_ROUTE_PATH__")({
  component: ApiDocsPage,
});

function ApiDocsPage() {
  return (
    <section>
      <SwaggerUI url="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" />
    </section>
  );
}
