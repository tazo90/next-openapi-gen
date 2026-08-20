export function createApiDocsApp(): {
  fetch: (request: Request) => Response;
} {
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
  return {
    fetch(): Response {
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  };
}
