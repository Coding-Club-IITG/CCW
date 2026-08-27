import {
  createNextOpsLogger,
  type NextOpsLogger,
} from "@coding-club-iitg/ops-logger/next";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { sharedServerEnv } from "@/lib/env/shared";
import { opsDetailsFromReport, setOpsLogReporter } from "@/lib/logger";

const EXPORT_LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;
type TelemetryGlobal = typeof globalThis & {
  __ccwOpsTelemetry?: NextOpsLogger & { provider?: NodeTracerProvider };
};

export function installOpsLoggerSink(logger: NextOpsLogger["logger"]): void {
  setOpsLogReporter((report) => {
    logger[report.level](report.message, opsDetailsFromReport(report));
  });
}

/** Register once per process, including across Next.js development reloads */
export function registerOpsRequestTelemetry(): void {
  const telemetryGlobal = globalThis as TelemetryGlobal;
  if (telemetryGlobal.__ccwOpsTelemetry) {
    installOpsLoggerSink(telemetryGlobal.__ccwOpsTelemetry.logger);
    return;
  }

  const ops = createNextOpsLogger({
    project: "ccw",
    service: "ccw-web",
    ingestionUrl: sharedServerEnv.OPS_LOG_INGEST_URL,
    secret: sharedServerEnv.OPS_LOG_INGEST_SECRET,
    enabled: sharedServerEnv.OPS_LOGGING_ENABLED,
    exportLevels: EXPORT_LEVELS,
  });
  installOpsLoggerSink(ops.logger);
  if (sharedServerEnv.OPS_LOGGING_ENABLED) {
    const provider = new NodeTracerProvider({
      spanProcessors: [ops.spanProcessor],
    });
    provider.register();
    telemetryGlobal.__ccwOpsTelemetry = { ...ops, provider };
  } else {
    telemetryGlobal.__ccwOpsTelemetry = ops;
  }
}
