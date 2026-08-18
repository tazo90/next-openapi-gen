<svelte:head>
  <title>API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css">
  <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
</svelte:head>

<div id="swagger-ui"></div><script>window.ui = SwaggerUIBundle({ url: "/__NEXT_OPENAPI_GEN_OUTPUT_FILE__", dom_id: "#swagger-ui" })</script>
