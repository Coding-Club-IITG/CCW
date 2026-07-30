import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: process.env.CI
      ? `pnpm start:web --port ${port}`
      : `pnpm dev:web --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_SECRET:
        process.env.AUTH_SECRET ?? "test-auth-secret-at-least-32-characters",
      BASE_URL: baseURL,
      TRUSTED_ORIGINS: baseURL,
      AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID ?? "test-client-id",
      AZURE_CLIENT_SECRET:
        process.env.AZURE_CLIENT_SECRET ?? "test-client-secret",
      AZURE_TENANT_ID: process.env.AZURE_TENANT_ID ?? "test-tenant-id",
      MONGODB_URI:
        process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/ccw-playwright",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379/15",
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? {
              executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
            }
          : undefined,
      },
    },
  ],
});
