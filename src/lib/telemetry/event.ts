import { randomUUID } from "node:crypto";

import {
  parseLogEventV1,
  type LogEventAttributeKey,
  type LogEventAttributeValue,
  type LogEventLevel,
  type LogEventService,
  type LogEventV1,
} from "@coding-club-iitg/ops-contract";

type SafeAttributes = Partial<
  Record<LogEventAttributeKey, LogEventAttributeValue>
>;

export type ApplicationEventInput = {
  service: Extract<LogEventService, "ccw-web" | "ccw-worker">;
  level: LogEventLevel;
  message: string;
  correlationId?: string;
  error?: { name?: string; code?: string };
  attributes?: SafeAttributes;
};

type HttpEventInput = {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
};

export function buildApplicationEvent(
  input: ApplicationEventInput,
): LogEventV1 {
  return parseLogEventV1({
    schemaVersion: 1,
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    project: "ccw",
    service: input.service,
    environment: "production",
    kind: "application",
    level: input.level,
    message: input.message,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.attributes ? { attributes: input.attributes } : {}),
  });
}

export function buildHttpEvent(input: HttpEventInput): LogEventV1 {
  const failed = input.statusCode >= 500;
  const rejected = input.statusCode >= 400 && !failed;

  return parseLogEventV1({
    schemaVersion: 1,
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    project: "ccw",
    service: "ccw-web",
    environment: "production",
    kind: "http",
    level: failed ? "error" : rejected ? "warn" : "info",
    message: failed
      ? "HTTP request failed"
      : rejected
        ? "HTTP request rejected"
        : "HTTP request completed",
    http: {
      method: input.method.toUpperCase(),
      route: input.route,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
    },
    ...(failed
      ? { error: { name: "HttpServerError", code: `HTTP_${input.statusCode}` } }
      : {}),
    attributes: {
      component: "route-handler",
      outcome: failed ? "failure" : rejected ? "rejected" : "success",
    },
  });
}
