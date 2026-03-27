"use client";

import "swagger-ui-react/swagger-ui.css";

import dynamic from "next/dynamic";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), {
  loading: () => <p>Loading Component...</p>,
  ssr: false,
});

export default function ApiDocsPage() {
  return (
    <section>
      <SwaggerUI url="/openapi.json" />
    </section>
  );
}
