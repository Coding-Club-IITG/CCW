import { NextRequest } from "next/server";
import { responseData, responseError } from "../utils/result";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const getSession = vi.hoisted(() => vi.fn());
const session = {
  user: {
    id: "member-1",
    name: "Test Member",
    email: "member@example.test",
  },
  session: {
    id: "session-1",
    userId: "member-1",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  },
};

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession,
    },
  },
}));

describe("notifications route", () => {
  beforeAll(async () => {
    await startTestMongo();
    getSession.mockResolvedValue(session);
  });

  afterEach(async () => {
    await clearTestMongo();
    getSession.mockResolvedValue(session);
  });

  afterAll(async () => {
    await stopTestMongo();
  });

  it("returns only the signed-in member's unread notifications", async () => {
    const Notification = (await import("@/models/Notification")).default;
    const { GET } = await import("@/app/api/notifications/route");
    await Notification.create([
      notification({ title: "Unread", read: false }),
      notification({ title: "Already read", read: true }),
      notification({ userId: "member-2", title: "Other member", read: false }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/notifications?unread=true"),
    );
    const body = await responseData(response);

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      userId: "member-1",
      title: "Unread",
      read: false,
    });
    expect(body.unreadCount).toBe(1);
    expect(body.pagination.total).toBe(1);
  });

  it("rejects notification queries without a session", async () => {
    const { GET } = await import("@/app/api/notifications/route");
    getSession.mockResolvedValueOnce(null);

    const response = await GET(
      new NextRequest("http://localhost/api/notifications"),
    );

    expect(response.status).toBe(401);
    expect(await responseError(response)).toEqual({
      code: "UNAUTHENTICATED",
      message: "Unauthorized",
    });
  });

  it("marks selected notifications as read without changing another member's data", async () => {
    const Notification = (await import("@/models/Notification")).default;
    const { PATCH } = await import("@/app/api/notifications/route");
    const [own, other] = await Notification.create([
      notification({ title: "Own" }),
      notification({ userId: "member-2", title: "Other" }),
    ]);

    const response = await PATCH(
      new NextRequest("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [own._id, other._id] }),
      }),
    );

    expect(response.status).toBe(200);
    expect((await Notification.findById(own._id).lean())?.read).toBe(true);
    expect((await Notification.findById(other._id).lean())?.read).toBe(false);
  });

  it("marks all unread notifications for the signed-in member as read", async () => {
    const Notification = (await import("@/models/Notification")).default;
    const { PATCH } = await import("@/app/api/notifications/route");
    await Notification.create([
      notification({ title: "First" }),
      notification({ title: "Second" }),
    ]);

    const response = await PATCH(
      new NextRequest("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(
      await Notification.countDocuments({ userId: "member-1", read: false }),
    ).toBe(0);
  });

  it("rejects a mark-read request without ids or the all flag", async () => {
    const { PATCH } = await import("@/app/api/notifications/route");

    const response = await PATCH(
      new NextRequest("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseError(response)).toEqual({
      code: "VALIDATION_ERROR",
      message: "Provide 'ids' array or 'all: true'.",
    });
  });

  it("deletes only read notifications owned by the signed-in member", async () => {
    const Notification = (await import("@/models/Notification")).default;
    const { DELETE } = await import("@/app/api/notifications/route");
    await Notification.create([
      notification({ title: "Read", read: true }),
      notification({ title: "Unread", read: false }),
      notification({ userId: "member-2", title: "Other read", read: true }),
    ]);

    const response = await DELETE(
      new NextRequest("http://localhost/api/notifications", {
        method: "DELETE",
      }),
    );
    const body = await responseData(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, deleted: 1 });
    expect(await Notification.find({}, { title: 1, _id: 0 }).lean()).toEqual(
      expect.arrayContaining([{ title: "Unread" }, { title: "Other read" }]),
    );
  });
});

function notification(
  overrides: Partial<{
    userId: string;
    title: string;
    read: boolean;
  }> = {},
) {
  return {
    userId: "member-1",
    type: "announcement",
    title: "Test notification",
    message: "A deterministic test message",
    read: false,
    ...overrides,
  };
}
