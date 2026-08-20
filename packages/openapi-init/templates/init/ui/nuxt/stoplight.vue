<script setup lang="ts">
useHead({
  title: "API Documentation",
  script: [{ src: "https://unpkg.com/@stoplight/elements/web-components.min.js" }],
  link: [{ rel: "stylesheet", href: "https://unpkg.com/@stoplight/elements/styles.min.css" }],
});
</script>

<template>
  <elements-api apiDescriptionUrl="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" router="hash"></elements-api>
</template>
