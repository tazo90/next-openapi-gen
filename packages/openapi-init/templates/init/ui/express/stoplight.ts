import type { IncomingMessage, ServerResponse } from "node:http";

export function createApiDocsRouter(): (
  request: IncomingMessage,
  response: ServerResponse,
) => void {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>API Documentation</title>
    <link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css">
    <script src="https://unpkg.com/@stoplight/elements/web-components.min.js"></script>
  </head>
  <body>
    <elements-api apiDescriptionUrl="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" router="hash"></elements-api>
  </body>
</html>`;
  return (_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html);
  };
}
