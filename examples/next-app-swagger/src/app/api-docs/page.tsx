"use client";

import "swagger-ui-react/swagger-ui.css";

import dynamic from "next/dynamic";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), {
  ssr: false,
  loading: () => <p>Loading Component...</p>,
});

export default function ApiDocsPage() {
  return <SwaggerUI url="/openapi.json" />;
}
