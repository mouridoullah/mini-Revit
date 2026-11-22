import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '4184';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    trace: 'on-first-retry',
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
      : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
    port: Number(port),
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
