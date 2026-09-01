import webPush, {
  type PushSubscription as WebPushSubscription,
} from "web-push";

import { getWebPushConfig } from "@/lib/push/config";
import { logger } from "@/lib/utils";
import Notification from "@/models/Notification";
import PushSubscription from "@/models/PushSubscription";

const FALLBACK_LINK = "/internal/notifications";

export function safeNotificationLink(link: unknown): string {
  return typeof link === "string" &&
    link.startsWith("/") &&
    !link.startsWith("//")
    ? link
    : FALLBACK_LINK;
}

export function buildPushPayload(notification: {
  _id: unknown;
  title: string;
  message: string;
  link?: string;
}) {
  return JSON.stringify({
    title: notification.title,
    message: notification.message,
    icon: "/icons/cc-192.png",
    badge: "/icons/cc-badge-96.png",
    tag: String(notification._id),
    link: safeNotificationLink(notification.link),
  });
}

type PushSender = (
  subscription: WebPushSubscription,
  payload: string,
) => Promise<unknown>;

function statusCodeFrom(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return undefined;
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

export async function deliverPushNotification(
  notificationId: string,
  send: PushSender = webPush.sendNotification,
) {
  const config = getWebPushConfig();
  if (!config) return;

  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  const notification = await Notification.findById(notificationId).lean();
  if (!notification) return;

  const subscriptions = await PushSubscription.find({
    userId: notification.userId,
  }).lean();
  if (subscriptions.length === 0) return;

  const payload = buildPushPayload(notification);
  let shouldRetry = false;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await send(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime?.getTime() ?? null,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
        );
      } catch (error) {
        const statusCode = statusCodeFrom(error);
        if (statusCode === 404 || statusCode === 410) {
          await PushSubscription.deleteOne({ _id: subscription._id });
          logger.info("Expired push subscription removed", {
            operation: "deliver_push_notification",
            notificationId,
            providerStatus: statusCode,
          });
          return;
        }
        shouldRetry = true;
        logger.warn("Push delivery attempt failed", {
          operation: "deliver_push_notification",
          notificationId,
          providerStatus: statusCode,
          errorName: error instanceof Error ? error.name : typeof error,
        });
      }
    }),
  );

  if (shouldRetry) throw new Error("One or more push deliveries failed");
}
