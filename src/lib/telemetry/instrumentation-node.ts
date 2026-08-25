import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { sharedServerEnv } from "@/lib/env/shared";
import { OpsRequestSpanProcessor } from "@/lib/telemetry/request-span-processor";

type TelemetryGlobal = typeof globalThis & {
  __ccwOpsTracerProvider?: NodeTracerProvider;
};

/** Register once per process, including across Next.js development reloads */
export function registerOpsRequestTelemetry(): void {
  if (!sharedServerEnv.OPS_LOGGING_ENABLED) return;

  const telemetryGlobal = globalThis as TelemetryGlobal;
  if (telemetryGlobal.__ccwOpsTracerProvider) return;

  const provider = new NodeTracerProvider({
    spanProcessors: [new OpsRequestSpanProcessor()],
  });
  provider.register();
  telemetryGlobal.__ccwOpsTracerProvider = provider;
}
