import { createFileRoute } from "@tanstack/react-router";
import { ApiReferenceReact } from "@scalar/api-reference-react";

import "@scalar/api-reference-react/style.css";

export const Route = createFileRoute("/api-docs")({
  component: ApiDocsPage,
});

function ApiDocsPage() {
  return (
    <ApiReferenceReact
      configuration={{
        _integration: "react",
        url: "/openapi.json",
      }}
    />
  );
}
