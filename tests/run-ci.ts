import { spawnSync } from "node:child_process";
import { MongoClient } from "mongodb";

const testUri = process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:27017";
const buildUri = new URL(testUri);
buildUri.pathname = "/ccw-test-build-" + process.pid;

const testEnvironment = {
  ...process.env,
  CI: "true",
  AUTH_SECRET: "test-auth-secret-at-least-32-characters",
  BASE_URL: "http://127.0.0.1:3100",
  TRUSTED_ORIGINS: "http://127.0.0.1:3100",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  AZURE_TENANT_ID: "test-tenant-id",
  MONGODB_URI: buildUri.toString(),
  MONGODB_TEST_URI: testUri,
  REDIS_URL: "redis://127.0.0.1:6379/15",
};

const commands = [
  ["lint"],
  ["typecheck"],
  ["test:unit"],
  ["test:coverage"],
  ["build"],
];

async function runCi() {
  try {
    for (const args of commands) {
      const result = spawnSync("pnpm", args, {
        env: testEnvironment,
        stdio: "inherit",
      });
      if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        break;
      }
    }
  } finally {
    const client = new MongoClient(buildUri.toString());
    try {
      await client.connect();
      if (!client.db().databaseName.startsWith("ccw-test-"))
        throw new Error(
          "Refusing to drop a database outside the test namespace.",
        );
      await client.db().dropDatabase();
    } finally {
      await client.close();
    }
  }
}
void runCi().catch(() => {
  console.error("CI database cleanup failed.");
  process.exitCode = 1;
});
