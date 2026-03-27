"use client";

import { RedocStandalone } from "redoc";

export default async function ApiDocsPage() {
  return (
    <section>
      <RedocStandalone specUrl="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" />
    </section>
  );
}
