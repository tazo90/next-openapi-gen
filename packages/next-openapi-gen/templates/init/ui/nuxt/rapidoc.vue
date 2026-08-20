<script setup lang="ts">
useHead({
  title: "API Documentation",
  script: [{ src: "https://unpkg.com/rapidoc/dist/rapidoc-min.js" }],

});
</script>

<template>
  <rapi-doc spec-url="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__" render-style="read"></rapi-doc>
</template>
