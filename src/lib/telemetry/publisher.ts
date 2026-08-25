import { createClient } from "redis";
import { parseLogEventV1 } from "@coding-club-iitg/ops-contract";

import { sharedServerEnv } from "@/lib/env/shared";

let telemetryRedis: ReturnType<typeof createClient> | undefined;
let connectPromise: Promise<void> | undefined;

function getTelemetryRedis() {
  if (!telemetryRedis) {
    telemetryRedis = createClient({
      url: sharedServerEnv.REDIS_URL,
      socket: {
        connectTimeout: 1_000,
        reconnectStrategy: false,
      },
    });
    telemetryRedis.on("error", () => {
      // Telemetry must not expose connection details or crash an application request
    });
  }
  return telemetryRedis;
}

async function ensureConnected(): Promise<ReturnType<typeof createClient>> {
  const client = getTelemetryRedis();
  if (client.isReady) return client;

  connectPromise ??= client
    .connect()
    .then(() => undefined)
    .finally(() => {
      connectPromise = undefined;
    });
  await connectPromise;
  return client;
}

export async function publishLogEvent(input: unknown): Promise<void> {
  try {
    const event = parseLogEventV1(input);
    if (!sharedServerEnv.OPS_LOGGING_ENABLED) return;
    const client = await ensureConnected();
    await client.xAdd(sharedServerEnv.OPS_LOG_STREAM_KEY, "*", {
      event: JSON.stringify(event),
    });
  } catch {
    // Ops ingestion is best-effort and must never change application behavior
  }
}

export async function closeOpsTelemetry(): Promise<void> {
  if (telemetryRedis?.isOpen) await telemetryRedis.close();
  telemetryRedis = undefined;
  connectPromise = undefined;
}
