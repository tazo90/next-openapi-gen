<script setup lang="ts">
useHead({
  title: "API Documentation",
  script: [{ src: "https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js" }],

});
</script>

<template>
  <redoc spec-url="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__"></redoc>
</template>
