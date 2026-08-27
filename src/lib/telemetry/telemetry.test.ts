import { createNextOpsLogger } from "@coding-club-iitg/ops-logger/next";
import { afterEach, describe, expect, it, vi } from "vitest";

const TRACE_ID = "0123456789abcdef0123456789abcdef";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createTestLogger() {
  return createNextOpsLogger({
    project: "ccw",
    service: "ccw-web",
    ingestionUrl: "https://ops.example.test/api/ingest/logs",
    secret: "test-ingestion-secret-at-least-32-chars",
    enabled: true,
    exportLevels: ["debug", "info", "warn", "error", "fatal"],
    console: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  });
}

function requestSpan(attributes: Record<string, unknown>) {
  return {
    attributes,
    duration: [0, 18_400_000],
    spanContext: () => ({ traceId: TRACE_ID }),
  };
}

describe("shared Next.js request telemetry", () => {
  it("exports one safe event for a completed API request span", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    const { logger, spanProcessor } = createTestLogger();

    spanProcessor.onEnd(
      requestSpan({
        "next.span_type": "BaseServer.handleRequest",
        "next.route": "/api/projects/[id]",
        "http.method": "GET",
        "http.status_code": 200,
        "http.target": "/api/projects/private-slug?token=secret",
        "http.user_agent": "sensitive-agent",
      }) as never,
    );
    await logger.flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    const event = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(event).toMatchObject({
      project: "ccw",
      service: "ccw-web",
      kind: "http",
      correlationId: TRACE_ID,
      http: {
        method: "GET",
        route: "/api/projects/[id]",
        statusCode: 200,
        durationMs: 18.4,
      },
    });
    expect(JSON.stringify(event)).not.toMatch(
      /private-slug|token=secret|sensitive-agent/,
    );
  });

  it("ignores page, child, incomplete, and unsafe request spans", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    const { logger, spanProcessor } = createTestLogger();
    const base = {
      "next.span_type": "BaseServer.handleRequest",
      "next.route": "/api/projects/[id]",
      "http.method": "GET",
      "http.status_code": 200,
    };

    for (const attributes of [
      { ...base, "next.route": "/projects/[id]" },
      { ...base, "next.span_type": "AppRouteRouteHandlers.run" },
      { ...base, "http.status_code": undefined },
      { ...base, "next.route": "/api/projects/secret%20slug" },
    ]) {
      spanProcessor.onEnd(requestSpan(attributes) as never);
    }
    await logger.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
