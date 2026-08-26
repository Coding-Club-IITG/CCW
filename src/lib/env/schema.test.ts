import { describe, expect, it } from "vitest";
import {
  parseBrowserEnv,
  parseCliEnv,
  parseTestEnv,
  parseWebEnv,
  parseWorkerEnv,
} from "@/lib/env/schema";

const required = {
  NODE_ENV: "development",
  MONGODB_URI: "mongodb://localhost:27017/ccw",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "a-valid-auth-secret-that-is-long-enough",
  BASE_URL: "http://localhost:3000",
  TRUSTED_ORIGINS: "http://localhost:3000, https://ccw.example.com",
  AZURE_CLIENT_ID: "client",
  AZURE_CLIENT_SECRET: "secret",
  AZURE_TENANT_ID: "tenant",
};

describe("runtime environment schemas", () => {
  it("parses web defaults and origins", () => {
    expect(parseWebEnv(required)).toMatchObject({
      TRUSTED_ORIGINS: ["http://localhost:3000", "https://ccw.example.com"],
      REGISTRATION_DEADLINE_MINUTES: 3,
      ROOM_PRE_START_SECONDS: 5,
      DISCONNECT_FORFEIT_TIMEOUT_SECONDS: 90,
      ROOM_READY_TIMEOUT_MINUTES: 2,
      SYNC_COOLDOWN: 60,
      FILE_UPLOAD_DIR: "uploads/files",
    });
  });

  it("does not require web credentials for workers", () => {
    expect(
      parseWorkerEnv({
        MONGODB_URI: required.MONGODB_URI,
        REDIS_URL: required.REDIS_URL,
      }),
    ).toMatchObject({
      MONGODB_URI: required.MONGODB_URI,
      REDIS_URL: required.REDIS_URL,
      OPS_LOG_INGEST_URL: "http://localhost:3005/api/ingest/logs",
    });
  });

  it("requires a non-default ingestion secret when production logging is enabled", () => {
    expect(() =>
      parseWorkerEnv({
        NODE_ENV: "production",
        MONGODB_URI: required.MONGODB_URI,
        REDIS_URL: required.REDIS_URL,
        OPS_LOGGING_ENABLED: "true",
      }),
    ).toThrow(/OPS_LOG_INGEST_SECRET/);
    expect(() =>
      parseWorkerEnv({
        NODE_ENV: "production",
        MONGODB_URI: required.MONGODB_URI,
        REDIS_URL: required.REDIS_URL,
        OPS_LOGGING_ENABLED: "true",
        OPS_LOG_INGEST_SECRET: "replace_with_same_32_char_secret_as_ops",
      }),
    ).toThrow(/OPS_LOG_INGEST_SECRET/);
    expect(
      parseWorkerEnv({
        NODE_ENV: "production",
        MONGODB_URI: required.MONGODB_URI,
        REDIS_URL: required.REDIS_URL,
        OPS_LOGGING_ENABLED: "true",
        OPS_LOG_INGEST_URL: "https://ops.example.test/api/ingest/logs",
        OPS_LOG_INGEST_SECRET: "production-ingestion-secret-32-characters",
      }).OPS_LOGGING_ENABLED,
    ).toBe(true);
  });

  it("accepts complete optional VAPID settings", () => {
    expect(
      parseWorkerEnv({
        MONGODB_URI: required.MONGODB_URI,
        REDIS_URL: required.REDIS_URL,
        WEB_PUSH_PUBLIC_KEY: "A".repeat(87),
        WEB_PUSH_PRIVATE_KEY: "B".repeat(43),
        WEB_PUSH_SUBJECT: "mailto:maintainer@example.test",
      }),
    ).toMatchObject({
      WEB_PUSH_PUBLIC_KEY: "A".repeat(87),
      WEB_PUSH_SUBJECT: "mailto:maintainer@example.test",
    });
  });

  it("rejects partial VAPID configuration", () => {
    expect(() =>
      parseWorkerEnv({
        MONGODB_URI: required.MONGODB_URI,
        REDIS_URL: required.REDIS_URL,
        WEB_PUSH_PUBLIC_KEY: "A".repeat(87),
      }),
    ).toThrow(/WEB_PUSH_PRIVATE_KEY|WEB_PUSH_SUBJECT/);
  });

  it("accepts MongoDB multi-host replica-set URLs", () => {
    const uri =
      "mongodb://user:password@mongo-0.example.test:27017,mongo-1.example.test:27017/ccw?replicaSet=rs0";
    expect(
      parseWorkerEnv({ MONGODB_URI: uri, REDIS_URL: required.REDIS_URL })
        .MONGODB_URI,
    ).toBe(uri);
  });

  it("requires Redis in every non-test runtime profile", () => {
    expect(() =>
      parseWorkerEnv({
        NODE_ENV: "development",
        MONGODB_URI: required.MONGODB_URI,
      }),
    ).toThrow(/REDIS_URL/);
    expect(() =>
      parseWorkerEnv({
        NODE_ENV: "production",
        MONGODB_URI: required.MONGODB_URI,
      }),
    ).toThrow(/REDIS_URL/);
    expect(() => parseCliEnv({ MONGODB_URI: required.MONGODB_URI })).toThrow(
      /REDIS_URL/,
    );
  });

  it("parses CLI and keeps connection defaults test-only", () => {
    expect(
      parseCliEnv({
        MONGODB_URI: required.MONGODB_URI,
        REDIS_URL: required.REDIS_URL,
      }).REDIS_URL,
    ).toBe(required.REDIS_URL);
    expect(
      parseTestEnv({ MONGODB_TEST_URI: required.MONGODB_URI }).REDIS_URL,
    ).toBe("redis://localhost:6379");
    expect(
      parseTestEnv({ MONGODB_TEST_URI: required.MONGODB_URI }).MOCK_CF_API,
    ).toBe(false);
  });

  it("parses browser booleans", () => {
    expect(
      parseBrowserEnv({
        DISABLE_NOTIFICATION_POLLING: "true",
      }),
    ).toEqual({
      DISABLE_NOTIFICATION_POLLING: true,
    });
    expect(
      parseBrowserEnv({
        DISABLE_NOTIFICATION_POLLING: "false",
      }),
    ).toEqual({
      DISABLE_NOTIFICATION_POLLING: false,
    });
  });

  it("aggregates invalid variable names without secret values", () => {
    let message = "";
    try {
      parseWebEnv({
        ...required,
        MONGODB_URI: "bad",
        AUTH_SECRET: "super-private",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("MONGODB_URI");
    expect(message).toContain("AUTH_SECRET");
    expect(message).not.toContain("super-private");
  });

  it("rejects production placeholders", () => {
    expect(() =>
      parseWebEnv({
        ...required,
        NODE_ENV: "production",
        AZURE_CLIENT_ID: "your_client_id",
      }),
    ).toThrow(/AZURE_CLIENT_ID/);
  });

  it("rejects malformed origins and URL schemes", () => {
    expect(() =>
      parseWebEnv({
        ...required,
        REDIS_URL: "http://localhost",
        TRUSTED_ORIGINS: "javascript:alert(1)",
      }),
    ).toThrow(/REDIS_URL|TRUSTED_ORIGINS/);
  });

  it("rejects connection URLs without a hostname", () => {
    expect(() =>
      parseWorkerEnv({
        MONGODB_URI: required.MONGODB_URI,
        REDIS_URL: "redis:///15",
      }),
    ).toThrow(/REDIS_URL.*hostname/);
  });

  it("rejects URLs and null bytes as upload paths", () => {
    expect(() =>
      parseWebEnv({ ...required, FILE_UPLOAD_DIR: "https://example.test" }),
    ).toThrow(/FILE_UPLOAD_DIR/);
    expect(() =>
      parseWebEnv({ ...required, BLOG_UPLOAD_DIR: "uploads\0blog" }),
    ).toThrow(/BLOG_UPLOAD_DIR/);
  });
});
