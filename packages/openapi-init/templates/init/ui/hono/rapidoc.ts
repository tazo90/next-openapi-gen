export function createApiDocsApp(): {
  fetch: (request: Request) => Response;
} {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>API Documentation</title>
    
    <script src="https://unpkg.com/rapidoc/dist/rapidoc-min.js"></script>
  </head>
  <body>
    <rapi-doc spec-url="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" render-style="read"></rapi-doc>
  </body>
</html>`;
  return {
    fetch(): Response {
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  };
}
