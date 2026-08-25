import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  insertMany: vi.fn(),
  addBulk: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/models/Notification", () => ({
  default: {
    create: mocks.create,
    insertMany: mocks.insertMany,
  },
}));

vi.mock("@/lib/push/config", () => ({ webPushConfigured: true }));
vi.mock("@/lib/push/queue", () => ({
  PUSH_JOB_NAME: "deliver_notification",
  pushNotificationQueue: { addBulk: mocks.addBulk },
}));
vi.mock("@/lib/utils", () => ({
  errorToLogMetadata: (error: unknown) => ({ error: String(error) }),
  logger: { error: mocks.loggerError },
}));

import {
  enqueuePushNotifications,
  notify,
  notifyBatch,
  notifyMany,
} from "@/lib/notify";

const data = {
  userId: "member-1",
  type: "announcement" as const,
  title: "Update",
  message: "Something changed",
};

describe("notification helpers", () => {
  beforeEach(() => {
    mocks.create.mockResolvedValue([{ _id: "notification-1", ...data }]);
    mocks.insertMany.mockImplementation(async (items: object[]) =>
      items.map((item, index) => ({
        _id: `notification-${index + 1}`,
        ...item,
      })),
    );
    mocks.addBulk.mockResolvedValue([]);
  });

  it("persists a notification before enqueueing its push job", async () => {
    const notification = await notify(data);

    expect(notification._id).toBe("notification-1");
    expect(mocks.create).toHaveBeenCalledWith([data], { session: undefined });
    expect(mocks.addBulk).toHaveBeenCalledWith([
      {
        name: "deliver_notification",
        data: { notificationId: "notification-1" },
        opts: { jobId: "notification-1" },
      },
    ]);
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.addBulk.mock.invocationCallOrder[0],
    );
  });

  it("supports shared and customized bulk notifications", async () => {
    const many = await notifyMany(["member-1", "member-2"], {
      type: "announcement",
      title: "Shared",
      message: "For everyone",
    });
    const batch = await notifyBatch([data, { ...data, userId: "member-2" }]);

    expect(many).toHaveLength(2);
    expect(batch).toHaveLength(2);
    expect(mocks.insertMany).toHaveBeenCalledTimes(2);
    expect(mocks.addBulk).toHaveBeenCalledTimes(2);
  });

  it("does nothing for empty recipient lists", async () => {
    await expect(
      notifyMany([], {
        type: "announcement",
        title: "Nobody",
        message: "No recipients",
      }),
    ).resolves.toEqual([]);
    await expect(notifyBatch([])).resolves.toEqual([]);
    expect(mocks.insertMany).not.toHaveBeenCalled();
    expect(mocks.addBulk).not.toHaveBeenCalled();
  });

  it("defers enqueueing when a MongoDB session is supplied", async () => {
    const session = { id: "transaction" } as never;
    const created = await notifyBatch([data], { session });

    expect(mocks.insertMany).toHaveBeenCalledWith([data], {
      ordered: false,
      session,
    });
    expect(mocks.addBulk).not.toHaveBeenCalled();

    await enqueuePushNotifications(created.map((item) => String(item._id)));
    expect(mocks.addBulk).toHaveBeenCalledOnce();
  });

  it("preserves created website notifications when queue insertion fails", async () => {
    mocks.addBulk.mockRejectedValueOnce(new Error("Redis unavailable"));

    await expect(notify(data)).resolves.toMatchObject({
      _id: "notification-1",
    });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Push notification enqueue failed",
      expect.objectContaining({ notificationCount: 1 }),
    );
  });
});
