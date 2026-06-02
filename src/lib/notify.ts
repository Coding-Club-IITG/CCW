/**
 * Shared notification helpers
 */

import Notification from "@/models/Notification";
import type { NotificationType } from "@/lib/constants";

interface NotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

/** Send a notification to a single user */
export async function notify(data: NotificationData) {
  await Notification.create(data);
}

/** Send the same notification to multiple users */
export async function notifyMany(
  userIds: string[],
  data: Omit<NotificationData, "userId">,
) {
  if (userIds.length === 0) return;

  const notifications = userIds.map((userId) => ({ userId, ...data }));
  await Notification.insertMany(notifications, { ordered: false });
}

/** Broadcast a notification to all provided users with per-user customization */
export async function notifyBatch(notifications: NotificationData[]) {
  if (notifications.length === 0) return;
  await Notification.insertMany(notifications, { ordered: false });
}
