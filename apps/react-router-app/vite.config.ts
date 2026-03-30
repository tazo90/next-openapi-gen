import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { createViteOpenApiPlugin } from "next-openapi-gen/vite";

export default defineConfig({
  plugins: [createViteOpenApiPlugin(), react()],
});
