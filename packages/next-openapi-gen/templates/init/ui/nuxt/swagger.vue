<script setup lang="ts">
useHead({
  title: "API Documentation",
  script: [{ src: "https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js" }],
  link: [{ rel: "stylesheet", href: "https://unpkg.com/swagger-ui-dist/swagger-ui.css" }],
});
</script>

<template>
  <div id="swagger-ui"></div><script>window.ui = SwaggerUIBundle({ url: "/__NEXT_OPENAPI_GEN_OUTPUT_FILE__", dom_id: "#swagger-ui" })</script>
</template>
