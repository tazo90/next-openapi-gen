export function createApiDocsApp(): {
  fetch: (request: Request) => Response;
} {
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
  return {
    fetch(): Response {
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  };
}
