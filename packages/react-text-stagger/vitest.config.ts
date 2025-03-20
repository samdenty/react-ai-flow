import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"react-text-stagger": path.resolve(__dirname, "./src/index.ts"),
			"text-stagger": path.resolve(__dirname, "../text-stagger/src/index.ts"),
			"text-stagger-replay": path.resolve(__dirname, "../replay/src/index.ts"),
		},
	},
	test: {
		browser: {
			provider: "playwright",
			enabled: true,
			name: "chromium",
		},
	},
});
