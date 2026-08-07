import { spawnSync } from "node:child_process";

const testEnvironment = {
  ...process.env,
  CI: "true",
  AUTH_SECRET: "test-auth-secret-at-least-32-characters",
  BASE_URL: "http://127.0.0.1:3100",
  TRUSTED_ORIGINS: "http://127.0.0.1:3100",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  AZURE_TENANT_ID: "test-tenant-id",
  MONGODB_URI: "mongodb://127.0.0.1:27017/ccw-ci",
  MONGODB_TEST_URI: process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017",
  REDIS_URL: "redis://127.0.0.1:6379/15",
};

const commands = [
  ["lint"],
  ["typecheck"],
  ["test:unit"],
  ["test:coverage"],
  ["build"],
];

for (const args of commands) {
  const result = spawnSync("pnpm", args, {
    env: testEnvironment,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
