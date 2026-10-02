import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";

import { getRedis } from "@/lib/db/redis";
import { PUBLIC_PAGE_VIEW_METRIC } from "@/lib/constants";
import { webEnv } from "@/lib/env/web";
import { getOpsLogger } from "@/lib/telemetry/instrumentationNode";
import { isPublicAnalyticsPage } from "@/lib/telemetry/publicPage";

export const publicPageViewSchema = z
  .object({
    page: z.string().max(256).refine(isPublicAnalyticsPage),
    eventId: z.uuid(),
  })
  .strict();

export function visitorIdentity(cookie: string | undefined) {
  const existing = z.uuid().safeParse(cookie);
  const id = existing.success ? existing.data : randomUUID();
  return {
    id,
    isNew: !existing.success,
    key: createHmac("sha256", webEnv.OPS_LOG_INGEST_SECRET)
      .update(`ccw:public-visitor:v1:${id}`)
      .digest("hex"),
  };
}

export function publicAnalyticsEnabled(): boolean {
  return webEnv.PUBLIC_ANALYTICS_ENABLED && webEnv.OPS_LOGGING_ENABLED;
}

export async function recordPublicPageView(
  visitorKey: string,
  input: z.infer<typeof publicPageViewSchema>,
): Promise<boolean> {
  const redis = await getRedis();
  // Bound retries and per-browser traffic
  const accepted = await redis.eval(
    `
    if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
    local count = redis.call('INCR', KEYS[2])
    if count == 1 then redis.call('EXPIRE', KEYS[2], 60) end
    if count > 60 then return 0 end
    redis.call('SET', KEYS[1], '1', 'EX', 86400)
    return 1
  `,
    {
      keys: [
        `analytics:view:${visitorKey}:${input.eventId}`,
        `analytics:rate:${visitorKey}`,
      ],
      arguments: [],
    },
  );
  if (accepted !== 1) return false;
  getOpsLogger().metric(PUBLIC_PAGE_VIEW_METRIC, {
    dimensions: { page: input.page, visitorKey },
  });
  return true;
}
