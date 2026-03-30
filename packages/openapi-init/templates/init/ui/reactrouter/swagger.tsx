import "swagger-ui-react/swagger-ui.css";

import SwaggerUI from "swagger-ui-react";

export default function ApiDocsPage() {
  return (
    <section>
      <SwaggerUI url="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" />
    </section>
  );
}
