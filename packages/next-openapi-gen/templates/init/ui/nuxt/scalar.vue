<script setup lang="ts">
useHead({
  title: "API Documentation",
  script: [{ src: "https://cdn.jsdelivr.net/npm/@scalar/api-reference" }],

});
</script>

<template>
  <scalar-api-reference spec-url="/__NEXT_OPENAPI_GEN_OUTPUT_FILE__"></scalar-api-reference>
</template>
