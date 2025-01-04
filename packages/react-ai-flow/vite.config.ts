import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "react-ai-flow": path.resolve(__dirname, "./src/index.ts"),
      "react-text-stagger": path.resolve(
        __dirname,
        "../react-text-stagger/src/index.ts"
      ),
      "text-stagger": path.resolve(__dirname, "../text-stagger/src/index.ts"),
    },
  },
  server: {
    port: 3001,
    host: true,
  },
});
