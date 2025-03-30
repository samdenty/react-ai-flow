import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, "demo-ai-search"),
  build: {
    outDir: resolve(__dirname, "dist/demo-ai-search"),
  },
  server: {
    port: 3001,
    fs: {
      allow: ['.']
    },
    middlewareMode: false,
  },
  define: {
    "process.env.ANTHROPIC_API_KEY": JSON.stringify(process.env.ANTHROPIC_API_KEY || ""),
  },
});
