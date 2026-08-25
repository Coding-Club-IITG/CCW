import { Queue } from "bullmq";

import { bullMqProducerConnection } from "@/lib/bullmq";

export const PUSH_QUEUE_NAME = "notification_push_queue";
export const PUSH_JOB_NAME = "deliver_notification" as const;

export interface PushJobData {
  notificationId: string;
}

export const pushNotificationQueue = new Queue<
  PushJobData,
  void,
  typeof PUSH_JOB_NAME
>(PUSH_QUEUE_NAME, {
  connection: bullMqProducerConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
  },
});
