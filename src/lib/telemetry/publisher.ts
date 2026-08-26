import { parseLogEventV1 } from "@coding-club-iitg/ops-contract";

import { sharedServerEnv } from "@/lib/env/shared";

type SerializedError = {
  name?: string;
  code?: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
};

const ERROR_TEXT_LIMIT = 2_048;
const STACK_TEXT_LIMIT = 8_000;
const MAX_CAUSE_DEPTH = 3;

function bounded(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.slice(0, limit);
}

/** Explicitly copy Error fields */
export function serializeErrorForOps(
  error: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): SerializedError {
  if (!(error instanceof Error)) {
    return {
      name: "NonError",
      message: bounded(String(error), ERROR_TEXT_LIMIT) ?? "Unknown failure",
    };
  }

  try {
    if (seen.has(error))
      return { name: "Error", message: "Circular error cause" };
    seen.add(error);
    const input = error as Error & { code?: unknown; cause?: unknown };
    const name = bounded(input.name, 128);
    const stack = bounded(input.stack, STACK_TEXT_LIMIT);
    const code =
      typeof input.code === "string" || typeof input.code === "number"
        ? String(input.code).slice(0, 128)
        : undefined;
    const cause =
      depth < MAX_CAUSE_DEPTH && input.cause !== undefined
        ? serializeErrorForOps(input.cause, depth + 1, seen)
        : undefined;
    return {
      ...(name ? { name } : {}),
      ...(code ? { code } : {}),
      message:
        bounded(input.message, ERROR_TEXT_LIMIT) ?? "Error details unavailable",
      ...(stack ? { stack } : {}),
      ...(cause ? { cause } : {}),
    };
  } catch {
    return { name: "Error", message: "Error details unavailable" };
  }
}

export async function publishLogEvent(
  input: unknown,
  diagnosticError?: unknown,
): Promise<void> {
  try {
    const event = parseLogEventV1(input);
    if (!sharedServerEnv.OPS_LOGGING_ENABLED) return;
    const payload =
      diagnosticError === undefined
        ? event
        : { ...event, error: serializeErrorForOps(diagnosticError) };
    const response = await fetch(sharedServerEnv.OPS_LOG_INGEST_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${sharedServerEnv.OPS_LOG_INGEST_SECRET}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (response.status !== 202)
      throw new Error("Ops ingestion rejected event");
  } catch {
    // Ops ingestion is best-effort and must never change application behavior
  }
}

export async function closeOpsTelemetry(): Promise<void> {
  // Retained for the worker shutdown interface
}
