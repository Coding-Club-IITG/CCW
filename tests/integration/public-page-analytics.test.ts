import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof createClient> | null,
  metric: vi.fn(),
}));
vi.mock("@/lib/db/redis", () => ({ getRedis: async () => state.client! }));
vi.mock("@/lib/telemetry/instrumentationNode", () => ({
  getOpsLogger: () => ({ metric: state.metric }),
}));

import {
  recordPublicPageView,
  visitorIdentity,
} from "@/lib/telemetry/publicPageViews";

describe("public analytics Redis deduplication", () => {
  const visitorKey = visitorIdentity(randomUUID()).key;
  const eventIds = Array.from({ length: 61 }, () => randomUUID());
  beforeAll(async () => {
    const url = new URL(process.env.REDIS_URL!);
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/15"
    ) {
      throw new Error("Analytics Redis tests require local test database 15");
    }
    state.client = createClient({ url: url.toString() });
    await state.client.connect();
  });
  afterAll(async () => {
    if (!state.client?.isReady) return;
    await state.client.del([
      `analytics:rate:${visitorKey}`,
      ...eventIds.map((id) => `analytics:view:${visitorKey}:${id}`),
    ]);
    await state.client.quit();
  });
  it("records each navigation once, caps browser traffic, and expires all keys", async () => {
    const input = { page: "/", eventId: eventIds[0] };
    expect(await recordPublicPageView(visitorKey, input)).toBe(true);
    expect(await recordPublicPageView(visitorKey, input)).toBe(false);
    for (const eventId of eventIds.slice(1, 60)) {
      expect(
        await recordPublicPageView(visitorKey, { page: "/blog", eventId }),
      ).toBe(true);
    }
    expect(
      await recordPublicPageView(visitorKey, {
        page: "/",
        eventId: eventIds[60],
      }),
    ).toBe(false);
    expect(state.metric).toHaveBeenCalledTimes(60);
    expect(
      await state.client!.ttl(`analytics:rate:${visitorKey}`),
    ).toBeGreaterThan(0);
    expect(
      await state.client!.ttl(`analytics:view:${visitorKey}:${eventIds[0]}`),
    ).toBeGreaterThan(0);
  });
});
