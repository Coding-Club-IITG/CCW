import type { Context } from "@opentelemetry/api";
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { LogEventV1 } from "@coding-club-iitg/ops-contract";

import { buildHttpEvent } from "@/lib/telemetry/event";
import { closeOpsTelemetry, publishLogEvent } from "@/lib/telemetry/publisher";

const NEXT_REQUEST_SPAN = "BaseServer.handleRequest";

type RequestSpanSnapshot = Pick<ReadableSpan, "attributes" | "duration">;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function durationMilliseconds(duration: readonly [number, number]): number {
  return duration[0] * 1_000 + duration[1] / 1_000_000;
}

/**
 * Map only approved request metadata. In particular, never serialize the span:
 * Next.js spans can also contain the raw request target and user agent.
 */
export function logEventFromRequestSpan(
  span: RequestSpanSnapshot,
): LogEventV1 | undefined {
  const spanType = span.attributes["next.span_type"];
  const route = span.attributes["next.route"] ?? span.attributes["http.route"];
  const method = span.attributes["http.method"];
  const statusCode = finiteNumber(span.attributes["http.status_code"]);

  if (
    spanType !== NEXT_REQUEST_SPAN ||
    typeof route !== "string" ||
    (route !== "/api" && !route.startsWith("/api/")) ||
    typeof method !== "string" ||
    statusCode === undefined ||
    !Number.isInteger(statusCode) ||
    statusCode < 100 ||
    statusCode > 599
  ) {
    return undefined;
  }

  try {
    return buildHttpEvent({
      method,
      route,
      statusCode,
      durationMs: Math.max(0, durationMilliseconds(span.duration)),
    });
  } catch {
    // Unexpected framework metadata must never affect request processing
    return undefined;
  }
}

export class OpsRequestSpanProcessor implements SpanProcessor {
  private readonly pending = new Set<Promise<void>>();

  onStart(_span: Span, _parentContext: Context): void {
    // Request telemetry is emitted only when the completed span has a status
  }

  onEnd(span: ReadableSpan): void {
    const event = logEventFromRequestSpan(span);
    if (!event) return;

    const task = publishLogEvent(event);
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  async forceFlush(): Promise<void> {
    await Promise.allSettled(this.pending);
  }

  async shutdown(): Promise<void> {
    await this.forceFlush();
    await closeOpsTelemetry();
  }
}
