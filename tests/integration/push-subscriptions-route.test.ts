import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { responseData, responseError } from "../utils/result";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getWebPushConfig: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/push/config", () => ({
  getWebPushConfig: mocks.getWebPushConfig,
}));

const session = (id: string) => ({
  user: { id, name: "Member", email: "member@example.test" },
  session: {
    id: `session-${id}`,
    userId: id,
    expiresAt: new Date("2030-01-01"),
  },
});

const subscription = (endpoint = "https://push.example.test/device-1") => ({
  endpoint,
  expirationTime: null,
  keys: { p256dh: "public-encryption-key", auth: "auth-secret" },
});

function request(method: "PUT" | "DELETE", body: unknown, origin?: string) {
  return new NextRequest("http://127.0.0.1:3000/api/push-subscriptions", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("push subscription route", () => {
  beforeAll(startTestMongo);

  beforeEach(() => {
    mocks.getSession.mockResolvedValue(session("member-1"));
    mocks.getWebPushConfig.mockReturnValue({
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "mailto:maintainer@example.test",
    });
  });

  afterEach(clearTestMongo);

  afterAll(stopTestMongo);

  it("requires authentication", async () => {
    const { GET } = await import("@/app/api/push-subscriptions/route");
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await GET(
      new NextRequest("http://127.0.0.1:3000/api/push-subscriptions"),
    );
    expect(response.status).toBe(401);
  });

  it("reports disabled and configured server states without exposing the private key", async () => {
    const { GET } = await import("@/app/api/push-subscriptions/route");
    mocks.getWebPushConfig.mockReturnValueOnce(null);
    expect(
      await responseData(
        await GET(
          new NextRequest("http://127.0.0.1:3000/api/push-subscriptions"),
        ),
      ),
    ).toEqual({ configured: false });

    const configured = await responseData(
      await GET(
        new NextRequest("http://127.0.0.1:3000/api/push-subscriptions"),
      ),
    );
    expect(configured).toEqual({ configured: true, publicKey: "public-key" });
    expect(configured).not.toHaveProperty("privateKey");
  });

  it("enforces trusted origins for mutations", async () => {
    const { PUT } = await import("@/app/api/push-subscriptions/route");
    for (const origin of [undefined, "https://attacker.example.test"]) {
      const response = await PUT(request("PUT", subscription(), origin));
      expect(response.status).toBe(403);
    }
  });

  it("allows the configured application origin without duplicating it in trusted origins", async () => {
    const { isAllowedPushOrigin } =
      await import("@/app/api/push-subscriptions/route");

    expect(
      isAllowedPushOrigin("http://localhost:3000", "http://localhost:3000", [
        "https://codingclub.in",
      ]),
    ).toBe(true);
  });

  it("validates HTTPS endpoints, keys, and exact request shapes", async () => {
    const { PUT } = await import("@/app/api/push-subscriptions/route");
    const invalid = [
      subscription("http://push.example.test/device"),
      { ...subscription(), keys: { p256dh: "", auth: "auth" } },
      { ...subscription(), unexpected: true },
    ];
    for (const body of invalid) {
      const response = await PUT(request("PUT", body, "http://127.0.0.1:3000"));
      expect(response.status).toBe(400);
    }
  });

  it("idempotently associates one endpoint with the current user", async () => {
    const PushSubscription = (await import("@/models/PushSubscription"))
      .default;
    const { PUT } = await import("@/app/api/push-subscriptions/route");
    const first = await PUT(
      request("PUT", subscription(), "http://127.0.0.1:3000"),
    );
    const second = await PUT(
      request("PUT", subscription(), "http://127.0.0.1:3000"),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await PushSubscription.countDocuments()).toBe(1);
    expect(await PushSubscription.findOne().lean()).toMatchObject({
      userId: "member-1",
      endpoint: subscription().endpoint,
    });

    mocks.getSession.mockResolvedValue(session("member-2"));
    await PUT(request("PUT", subscription(), "http://127.0.0.1:3000"));
    expect(await PushSubscription.countDocuments()).toBe(1);
    expect((await PushSubscription.findOne().lean())?.userId).toBe("member-2");
  });

  it("deletes only a subscription owned by the current user", async () => {
    const PushSubscription = (await import("@/models/PushSubscription"))
      .default;
    const { DELETE } = await import("@/app/api/push-subscriptions/route");
    await PushSubscription.create({
      userId: "member-2",
      ...subscription(),
      p256dh: subscription().keys.p256dh,
      auth: subscription().keys.auth,
      keys: undefined,
    });

    const response = await DELETE(
      request(
        "DELETE",
        { endpoint: subscription().endpoint },
        "http://127.0.0.1:3000",
      ),
    );
    expect(await responseData(response)).toEqual({
      enabled: false,
      deleted: false,
    });
    expect(await PushSubscription.countDocuments()).toBe(1);
  });

  it("deletes the current user's matching endpoint", async () => {
    const PushSubscription = (await import("@/models/PushSubscription"))
      .default;
    const { DELETE } = await import("@/app/api/push-subscriptions/route");
    await PushSubscription.create({
      userId: "member-1",
      endpoint: subscription().endpoint,
      p256dh: subscription().keys.p256dh,
      auth: subscription().keys.auth,
    });

    const response = await DELETE(
      request(
        "DELETE",
        { endpoint: subscription().endpoint },
        "http://127.0.0.1:3000",
      ),
    );
    expect(await responseData(response)).toEqual({
      enabled: false,
      deleted: true,
    });
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  it("rejects enabling when VAPID is disabled", async () => {
    const { PUT } = await import("@/app/api/push-subscriptions/route");
    mocks.getWebPushConfig.mockReturnValueOnce(null);
    const response = await PUT(
      request("PUT", subscription(), "http://127.0.0.1:3000"),
    );
    expect(response.status).toBe(503);
    expect((await responseError(response)).code).toBe("SERVICE_UNAVAILABLE");
  });
});
