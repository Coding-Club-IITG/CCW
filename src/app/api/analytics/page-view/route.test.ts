import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  metric: vi.fn(),
  eval: vi.fn(),
  warn: vi.fn(),
  env: {
    NODE_ENV: "production",
    PUBLIC_ANALYTICS_ENABLED: true,
    OPS_LOGGING_ENABLED: true,
    BASE_URL: "https://ccw.test",
    TRUSTED_ORIGINS: ["https://ccw.test"],
    OPS_LOG_INGEST_SECRET: "test-visitor-hmac-secret-at-least-32-characters",
  },
}));
vi.mock("@/lib/env/web", () => ({ webEnv: mocks.env }));
vi.mock("@/lib/db/redis", () => ({
  getRedis: async () => ({ eval: mocks.eval }),
}));
vi.mock("@/lib/telemetry/instrumentationNode", () => ({
  getOpsLogger: () => ({ metric: mocks.metric }),
}));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { warn: mocks.warn } }));

import { POST } from "@/app/api/analytics/page-view/route";
import { visitorIdentity } from "@/lib/telemetry/publicPageViews";

const visitor = randomUUID();
const eventId = randomUUID();
function request(
  body: unknown = { page: "/", eventId },
  headers: Record<string, string> = {},
) {
  return new NextRequest("https://ccw.test/api/analytics/page-view", {
    method: "POST",
    headers: {
      origin: "https://ccw.test",
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      cookie: `ccw_visitor=${visitor}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("public page collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eval.mockResolvedValue(1);
    mocks.env.PUBLIC_ANALYTICS_ENABLED = true;
    mocks.env.OPS_LOGGING_ENABLED = true;
  });
  it("establishes a secure cookie before counting and does not count blocked cookies", async () => {
    const response = await POST(request(undefined, { cookie: "" }));
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { accepted: false, needsCookie: true },
    });
    const cookie = response.cookies.get("ccw_visitor")!;
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/analytics",
      maxAge: 7776000,
    });
    expect(mocks.metric).not.toHaveBeenCalled();
    await POST(request(undefined, { cookie: "" }));
    expect(mocks.metric).not.toHaveBeenCalled();
    const tracked = await POST(
      request(undefined, { cookie: `ccw_visitor=${cookie.value}` }),
    );
    expect(await tracked.json()).toMatchObject({
      data: { accepted: true, needsCookie: false },
    });
  });
  it("emits only public paths and a stable digest, never the cookie or account identity", async () => {
    await POST(request({ page: "/blog/hello-world", eventId }));
    expect(mocks.metric).toHaveBeenCalledWith("page_view", {
      dimensions: {
        page: "/blog/hello-world",
        visitorKey: visitorIdentity(visitor).key,
      },
    });
    expect(JSON.stringify(mocks.metric.mock.calls)).not.toContain(visitor);
    expect(visitorIdentity(visitor).key).toMatch(/^[a-f0-9]{64}$/);
    expect(visitorIdentity(visitor).key).not.toBe(
      visitorIdentity(randomUUID()).key,
    );
  });
  it.each([
    "/internal/dashboard",
    "/admin",
    "/api/files",
    "/blog?token=secret",
    "/#section",
    "/unknown",
    "https://ccw.test/",
    "/blog/private%20path",
  ])("rejects unsupported paths: %s", async (page) => {
    expect((await POST(request({ page, eventId }))).status).toBe(400);
    expect(mocks.eval).not.toHaveBeenCalled();
    expect(mocks.metric).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ dnt: "1" }, { "sec-gpc": "1" }])(
    "honors privacy signals without setting a cookie",
    async (signal) => {
      const response = await POST(
        request(undefined, { ...signal, cookie: "" }),
      );
      expect(response.cookies.getAll()).toHaveLength(0);
      expect(mocks.metric).not.toHaveBeenCalled();
    },
  );
  it.each(["PUBLIC_ANALYTICS_ENABLED", "OPS_LOGGING_ENABLED"] as const)(
    "does nothing when %s is disabled",
    async (flag) => {
      mocks.env[flag] = false;
      const response = await POST(request(undefined, { cookie: "" }));
      expect(response.cookies.getAll()).toHaveLength(0);
      expect(mocks.metric).not.toHaveBeenCalled();
    },
  );
  it("rejects cross-origin requests and invalid bodies before recording", async () => {
    expect(
      (await POST(request(undefined, { origin: "https://attacker.test" })))
        .status,
    ).toBe(403);
    expect((await POST(request(undefined, { origin: "" }))).status).toBe(403);
    expect(
      (await POST(request(undefined, { "sec-fetch-site": "cross-site" })))
        .status,
    ).toBe(403);
    expect(
      (await POST(request(undefined, { "content-type": "text/plain" }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({ page: "/", eventId, email: "private@example.com" }),
        )
      ).status,
    ).toBe(400);
    expect((await POST(request({ page: "/", eventId: "bad" }))).status).toBe(
      400,
    );
    expect((await POST(request("x".repeat(1025)))).status).toBe(400);
    expect(mocks.metric).not.toHaveBeenCalled();
  });
  it("suppresses duplicate or rate-limited visits and tolerates outages", async () => {
    mocks.eval.mockResolvedValueOnce(0);
    expect(await (await POST(request())).json()).toMatchObject({
      data: { accepted: false },
    });
    mocks.eval.mockRejectedValueOnce(new Error("Redis unavailable"));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.metric).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith("Public analytics unavailable", {
      operation: "record-public-page-view",
    });
  });
});
