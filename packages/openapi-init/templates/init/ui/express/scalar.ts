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
    
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </head>
  <body>
    <scalar-api-reference spec-url="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__"></scalar-api-reference>
  </body>
</html>`;
  return (_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html);
  };
}
