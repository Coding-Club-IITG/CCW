import { type Job, Worker } from "bullmq";

import { deliverPushNotification } from "@/lib/notifications/push/delivery";
import {
  PUSH_QUEUE_NAME,
  type PushJobData,
} from "@/lib/notifications/push/queue";
import { bullMqConnection } from "@/lib/queues/bullMq";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

export const pushNotificationWorker = new Worker<PushJobData>(
  PUSH_QUEUE_NAME,
  async (job: Job<PushJobData>) => {
    await deliverPushNotification(job.data.notificationId);
  },
  { connection: bullMqConnection, concurrency: 5 },
);

pushNotificationWorker.on("failed", (job, error) => {
  logger.error("Push notification job failed", {
    operation: "process_push_notification",
    notificationId: job?.data.notificationId,
    attempt: job?.attemptsMade,
    ...errorToLogMetadata(error),
  });
});
