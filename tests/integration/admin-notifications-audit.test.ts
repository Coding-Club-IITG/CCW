import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import AuditLog from "@/models/AuditLog";
import Notification from "@/models/Notification";
import User from "@/models/User";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const getSession = vi.hoisted(() => vi.fn());
const enqueuePushNotifications = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));
vi.mock("@/lib/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notify")>()),
  enqueuePushNotifications,
}));

describe("administrative notification audit", () => {
  beforeAll(startTestMongo);
  afterEach(async () => {
    await clearTestMongo();
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      user: { id: "admin-1", name: "Global Admin", access: "Admin" },
      session: { id: "session-1", userId: "admin-1" },
    });
  });
  afterAll(stopTestMongo);

  it("commits notification rows and one redacted broadcast event", async () => {
    getSession.mockResolvedValue({
      user: { id: "admin-1", name: "Global Admin", access: "Admin" },
      session: { id: "session-1", userId: "admin-1" },
    });
    await User.create([
      { name: "One", email: "one@example.test" },
      { name: "Two", email: "two@example.test" },
    ]);
    const { POST } = await import("@/app/api/admin/notifications/route");

    const response = await POST(
      request({
        target: "all",
        title: "Maintenance",
        message: "Secret operational details",
        link: "https://example.test/private?token=secret",
      }),
    );

    expect(response.status).toBe(200);
    expect(await Notification.countDocuments()).toBe(2);
    expect(enqueuePushNotifications).toHaveBeenCalledOnce();
    const audit = await AuditLog.findOne().lean();
    expect(audit).toMatchObject({
      category: "notifications",
      action: "broadcast",
      operation: "notifications.broadcast",
      actor: { userId: "admin-1", access: "Admin" },
      after: {
        target: "all",
        type: "announcement",
        title: "Maintenance",
        recipientCount: 2,
        hasLink: true,
      },
    });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("Secret operational details");
    expect(serialized).not.toContain("one@example.test");
    expect(serialized).not.toContain("token=secret");
  });

  it("does not record a denied broadcast", async () => {
    getSession.mockResolvedValue({
      user: { id: "member-1", name: "Member", access: "Member" },
      session: { id: "session-2", userId: "member-1" },
    });
    const { POST } = await import("@/app/api/admin/notifications/route");

    expect(
      (await POST(request({ target: "all", title: "No", message: "No" })))
        .status,
    ).toBe(403);
    expect(await Notification.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });
});

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
