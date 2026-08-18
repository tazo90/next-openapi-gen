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
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css">
    <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
  </head>
  <body>
    <div id="swagger-ui"></div><script>window.ui = SwaggerUIBundle({ url: "/__NEXT_OPENAPI_GEN_OUTPUT_FILE__", dom_id: "#swagger-ui" })</script>
  </body>
</html>`;
  return (_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html);
  };
}
