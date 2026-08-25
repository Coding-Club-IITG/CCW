/**
 * Shared notification helpers
 */

import type { ClientSession } from "mongoose";

import type { NotificationType } from "@/lib/constants";
import { webPushConfigured } from "@/lib/push/config";
import { PUSH_JOB_NAME, pushNotificationQueue } from "@/lib/push/queue";
import { errorToLogMetadata, logger } from "@/lib/utils";
import Notification from "@/models/Notification";

export interface NotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

export interface NotifyOptions {
  session?: ClientSession;
  enqueue?: boolean;
}

export async function enqueuePushNotifications(
  notificationIds: readonly string[],
) {
  if (!webPushConfigured || notificationIds.length === 0) return;
  try {
    await pushNotificationQueue.addBulk(
      notificationIds.map((notificationId) => ({
        name: PUSH_JOB_NAME,
        data: { notificationId },
        opts: { jobId: notificationId },
      })),
    );
  } catch (error) {
    logger.error("Push notification enqueue failed", {
      operation: "enqueue_push_notifications",
      notificationCount: notificationIds.length,
      ...errorToLogMetadata(error),
    });
  }
}

async function enqueueUnlessDeferred(
  ids: string[],
  options: NotifyOptions | undefined,
) {
  if (options?.enqueue === false || options?.session) return;
  await enqueuePushNotifications(ids);
}

/** Send a notification to a single user */
export async function notify(data: NotificationData, options?: NotifyOptions) {
  const [notification] = await Notification.create([data], {
    session: options?.session,
  });
  await enqueueUnlessDeferred([String(notification._id)], options);
  return notification;
}

/** Send the same notification to multiple users */
export async function notifyMany(
  userIds: string[],
  data: Omit<NotificationData, "userId">,
  options?: NotifyOptions,
) {
  if (userIds.length === 0) return [];

  const notifications = userIds.map((userId) => ({ userId, ...data }));
  const created = await Notification.insertMany(notifications, {
    ordered: false,
    session: options?.session,
  });
  await enqueueUnlessDeferred(
    created.map((notification) => String(notification._id)),
    options,
  );
  return created;
}

/** Broadcast a notification to all provided users with per-user customization */
export async function notifyBatch(
  notifications: NotificationData[],
  options?: NotifyOptions,
) {
  if (notifications.length === 0) return [];
  const created = await Notification.insertMany(notifications, {
    ordered: false,
    session: options?.session,
  });
  await enqueueUnlessDeferred(
    created.map((notification) => String(notification._id)),
    options,
  );
  return created;
}
