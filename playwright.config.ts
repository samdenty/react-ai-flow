import { defineConfig, devices } from '@playwright/experimental-ct-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.resolve(fileURLToPath(import.meta.url), '..');

export default defineConfig({
  testDir: './e2e',
  snapshotDir: './e2e/__snapshots__',
  timeout: 120 * 1000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    ctPort: 3100,

    ctViteConfig: {
      resolve: {
        alias: {
          "react-text-stagger": path.resolve(__dirname, "./packages/react-text-stagger/src/index.ts"),
          "text-stagger": path.resolve(__dirname, "./packages/text-stagger/src/index.ts"),
          "text-stagger-record": path.resolve(__dirname, "./packages/record/src/index.ts"),
          "text-stagger-replay": path.resolve(__dirname, "./packages/replay/src/index.ts"),
        },
      },
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
