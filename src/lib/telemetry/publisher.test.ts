import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/shared", () => ({
  sharedServerEnv: {
    OPS_LOGGING_ENABLED: true,
    OPS_LOG_INGEST_URL: "https://ops.example.test/api/ingest/logs",
    OPS_LOG_INGEST_SECRET: "test-ingestion-secret-at-least-32-chars",
  },
}));

import { buildApplicationEvent } from "@/lib/telemetry/event";
import {
  publishLogEvent,
  serializeErrorForOps,
} from "@/lib/telemetry/publisher";

afterEach(() => vi.unstubAllGlobals());

describe("Ops HTTP telemetry publisher", () => {
  it("explicitly serializes non-enumerable Error fields and nested causes", () => {
    const cause = Object.assign(new Error("database token=private"), {
      code: "ECONNRESET",
    });
    const error = new Error("request failed", { cause });
    error.stack =
      "Error: request failed\n    at run (/srv/ccw/src/worker.ts:10:2)";

    expect(serializeErrorForOps(error)).toMatchObject({
      name: "Error",
      message: "request failed",
      stack: error.stack,
      cause: {
        name: "Error",
        code: "ECONNRESET",
        message: "database token=private",
      },
    });
  });

  it("posts a validated base event plus raw Error fields for Ops sanitization", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    const event = buildApplicationEvent({
      service: "ccw-worker",
      level: "error",
      message: "Background job failed",
      error: { name: "JobError", code: "JOB_FAILED" },
    });
    const error = new Error("token=private-value");

    await expect(publishLogEvent(event, error)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ops.example.test/api/ingest/logs");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      authorization: "Bearer test-ingestion-secret-at-least-32-chars",
    });
    expect(JSON.parse(String(options.body))).toMatchObject({
      eventId: event.eventId,
      error: { name: "Error", message: "token=private-value" },
    });
  });

  it("never changes application behavior when ingestion fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const event = buildApplicationEvent({
      service: "ccw-web",
      level: "info",
      message: "Application event",
    });
    await expect(publishLogEvent(event)).resolves.toBeUndefined();
  });
});
