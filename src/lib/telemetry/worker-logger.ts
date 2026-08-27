import { createOpsLogger } from "@coding-club-iitg/ops-logger";

import { sharedServerEnv } from "@/lib/env/shared";
import { opsDetailsFromReport, setOpsLogReporter } from "@/lib/logger";

export const workerOpsLogger = createOpsLogger({
  project: "ccw",
  service: "ccw-worker",
  ingestionUrl: sharedServerEnv.OPS_LOG_INGEST_URL,
  secret: sharedServerEnv.OPS_LOG_INGEST_SECRET,
  enabled: sharedServerEnv.OPS_LOGGING_ENABLED,
  exportLevels: ["debug", "info", "warn", "error", "fatal"],
});

setOpsLogReporter((report) => {
  workerOpsLogger[report.level](report.message, opsDetailsFromReport(report));
});
