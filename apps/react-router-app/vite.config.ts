import react from "@vitejs/plugin-react";
import { createViteOpenApiPlugin } from "next-openapi-gen/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [createViteOpenApiPlugin(), react()],
});
