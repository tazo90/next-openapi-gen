"use client";

import "swagger-ui-react/swagger-ui.css";

import dynamic from "next/dynamic";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), {
  loading: () => <p>Loading Component...</p>,
});

export default function ApiDocsPage() {
  return (
    <section>
      <SwaggerUI url="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" />
    </section>
  );
}
