import type { ConnectionOptions } from "bullmq";

import { sharedServerEnv } from "@/lib/env/shared";

const redisUrl = new URL(sharedServerEnv.REDIS_URL);

export const bullMqConnection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: redisUrl.port ? Number.parseInt(redisUrl.port, 10) : 6379,
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db:
    redisUrl.pathname && redisUrl.pathname.slice(1)
      ? Number.parseInt(redisUrl.pathname.slice(1), 10)
      : undefined,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
};

export const bullMqProducerConnection: ConnectionOptions = {
  ...bullMqConnection,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
};
