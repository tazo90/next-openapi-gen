import { RedocStandalone } from "redoc";

export default function ApiDocsPage() {
  return (
    <section>
      <RedocStandalone specUrl="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" />
    </section>
  );
}
