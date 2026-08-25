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

import Notification from "@/models/Notification";
import PushSubscription from "@/models/PushSubscription";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../../../tests/utils/mongodb";

const mocks = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  defaultSend: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: mocks.defaultSend,
  },
}));
vi.mock("@/lib/push/config", () => ({
  getWebPushConfig: () => ({
    publicKey: "public-key",
    privateKey: "private-key",
    subject: "mailto:maintainer@example.test",
  }),
}));
vi.mock("@/lib/utils", () => ({
  errorToLogMetadata: (error: unknown) => ({ error: String(error) }),
  logger: { info: mocks.info, warn: mocks.warn },
}));

import {
  buildPushPayload,
  deliverPushNotification,
  safeNotificationLink,
} from "@/lib/push/delivery";

describe("push delivery", () => {
  beforeAll(startTestMongo);
  beforeEach(() => {
    mocks.defaultSend.mockResolvedValue(undefined);
  });
  afterEach(clearTestMongo);
  afterAll(stopTestMongo);

  it("treats missing notifications and users without subscriptions as no-ops", async () => {
    await deliverPushNotification("507f1f77bcf86cd799439011");
    const notification = await createNotification();
    await deliverPushNotification(String(notification._id));
    expect(mocks.defaultSend).not.toHaveBeenCalled();
  });

  it("delivers independently to every subscribed device", async () => {
    const notification = await createNotification();
    await Promise.all([
      createSubscription("https://push.example.test/device-1"),
      createSubscription("https://push.example.test/device-2"),
    ]);

    await deliverPushNotification(String(notification._id));

    expect(mocks.defaultSend).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(mocks.defaultSend.mock.calls[0][1]);
    expect(payload).toMatchObject({
      title: "Club update",
      message: "A persisted notification",
      tag: String(notification._id),
      link: "/internal/calendar",
    });
  });

  it("removes permanently expired subscriptions without retrying", async () => {
    const notification = await createNotification();
    await createSubscription("https://push.example.test/expired");
    mocks.defaultSend.mockRejectedValueOnce(
      Object.assign(new Error("Gone"), { statusCode: 410 }),
    );

    await expect(
      deliverPushNotification(String(notification._id)),
    ).resolves.toBeUndefined();
    expect(await PushSubscription.countDocuments()).toBe(0);
    expect(mocks.info).toHaveBeenCalledWith(
      "Expired push subscription removed",
      expect.objectContaining({ providerStatus: 410 }),
    );
  });

  it("throws after processing devices when a transient failure needs a retry", async () => {
    const notification = await createNotification();
    await createSubscription("https://push.example.test/transient");
    mocks.defaultSend.mockRejectedValueOnce(
      Object.assign(new Error("Temporary provider failure"), {
        statusCode: 503,
      }),
    );

    await expect(
      deliverPushNotification(String(notification._id)),
    ).rejects.toThrow("One or more push deliveries failed");
    expect(await PushSubscription.countDocuments()).toBe(1);
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(
      "push.example.test",
    );
  });

  it("uses a same-origin fallback and notification ID deduplication tag", () => {
    expect(safeNotificationLink("https://outside.example.test/path")).toBe(
      "/internal/notifications",
    );
    expect(safeNotificationLink("//outside.example.test/path")).toBe(
      "/internal/notifications",
    );
    const payload = JSON.parse(
      buildPushPayload({
        _id: "notification-id",
        title: "Title",
        message: "Message",
        link: "https://outside.example.test/path",
      }),
    );
    expect(payload).toMatchObject({
      tag: "notification-id",
      link: "/internal/notifications",
    });
  });
});

function createNotification() {
  return Notification.create({
    userId: "member-1",
    type: "announcement",
    title: "Club update",
    message: "A persisted notification",
    link: "/internal/calendar",
  });
}

function createSubscription(endpoint: string) {
  return PushSubscription.create({
    userId: "member-1",
    endpoint,
    p256dh: "public-encryption-key",
    auth: "auth-secret",
  });
}
