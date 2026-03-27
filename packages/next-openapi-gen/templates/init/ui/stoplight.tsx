"use client";

import { API } from "@stoplight/elements";
import "@stoplight/elements/styles.min.css";

export default function ApiDocsPage() {
  return (
    <section style={{ height: "100vh" }}>
      <API apiDescriptionUrl="__NEXT_OPENAPI_GEN_OUTPUT_FILE__" />
    </section>
  );
}
