import { connectMongoDB } from "@/lib/db/mongodb";
import { logger } from "@/lib/telemetry/logger";
import { finalize } from "@/lib/potd/finalize";

/**
 * POTD sync cron entry point
 */
export async function syncPOTDSubmissions(): Promise<void> {
  logger.info("[potd-sync] Starting POTD finalize run...");
  await connectMongoDB();
  await finalize(new Date());
  logger.info("[potd-sync] POTD finalize run complete.");
}
