import { validateLogEventV1 } from "@coding-club-iitg/ops-contract";
import { describe, expect, it } from "vitest";

import { buildApplicationEvent, buildHttpEvent } from "@/lib/telemetry/event";
import { logEventFromRequestSpan } from "@/lib/telemetry/request-span-processor";

describe("CCW event builders", () => {
  it("builds a safe route-template HTTP event", () => {
    const event = buildHttpEvent({
      method: "get",
      route: "/api/projects/[id]",
      statusCode: 200,
      durationMs: 12.5,
    });

    expect(event.http).toEqual({
      method: "GET",
      route: "/api/projects/[id]",
      statusCode: 200,
      durationMs: 12.5,
    });
    expect(validateLogEventV1(event).success).toBe(true);
  });

  it("builds a CCW worker event", () => {
    const event = buildApplicationEvent({
      service: "ccw-worker",
      level: "info",
      message: "Worker started",
      attributes: { component: "worker", outcome: "success" },
    });

    expect(event).toMatchObject({
      project: "ccw",
      service: "ccw-worker",
      kind: "application",
    });
    expect(validateLogEventV1(event).success).toBe(true);
  });
});

describe("central request telemetry", () => {
  it("maps only approved fields from the completed Next.js request span", () => {
    const event = logEventFromRequestSpan({
      attributes: {
        "next.span_type": "BaseServer.handleRequest",
        "next.route": "/api/projects/[id]",
        "http.method": "GET",
        "http.status_code": 200,
        "http.target": "/api/projects/private-slug?token=secret",
        "http.user_agent": "sensitive-agent",
      },
      duration: [0, 18_400_000],
    });

    expect(event?.http).toEqual({
      method: "GET",
      route: "/api/projects/[id]",
      statusCode: 200,
      durationMs: 18.4,
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("private-slug");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("sensitive-agent");
  });

  it("ignores page, child, incomplete, and unsafe request spans", () => {
    const base = {
      "next.span_type": "BaseServer.handleRequest",
      "next.route": "/api/projects/[id]",
      "http.method": "GET",
      "http.status_code": 200,
    };

    expect(
      logEventFromRequestSpan({
        attributes: { ...base, "next.route": "/projects/[id]" },
        duration: [0, 1],
      }),
    ).toBeUndefined();
    expect(
      logEventFromRequestSpan({
        attributes: { ...base, "next.span_type": "AppRouteRouteHandlers.run" },
        duration: [0, 1],
      }),
    ).toBeUndefined();
    expect(
      logEventFromRequestSpan({
        attributes: { ...base, "http.status_code": undefined },
        duration: [0, 1],
      }),
    ).toBeUndefined();
    expect(
      logEventFromRequestSpan({
        attributes: { ...base, "next.route": "/api/projects/secret%20slug" },
        duration: [0, 1],
      }),
    ).toBeUndefined();
  });
});
