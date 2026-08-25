import "@/lib/env/web";

/** Import-time validation intentionally runs before handlers initialize dependencies */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerOpsRequestTelemetry } =
    await import("./lib/telemetry/instrumentation-node");
  registerOpsRequestTelemetry();
}
