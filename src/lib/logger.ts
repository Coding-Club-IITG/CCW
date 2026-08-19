type LogLevel = "info" | "warn" | "error" | "debug";

export type LogMetadata = Record<string, unknown>;

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY =
  /authorization|cookie|token|secret|password|credential|submission|source.?code|request.?body|profile|email/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_TOKEN = /\bBearer\s+\S+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi;
const SECRET_QUERY_VALUE =
  /([?&](?:access_token|api_key|key|secret|token)=)[^&\s]+/gi;

function redactString(value: string): string {
  return value
    .replace(EMAIL, "[REDACTED_EMAIL]")
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(JWT, REDACTED)
    .replace(URL_CREDENTIALS, "$1[REDACTED]@")
    .replace(SECRET_QUERY_VALUE, "$1[REDACTED]");
}

function serializeForLog(
  value: unknown,
  seen: WeakSet<object>,
  depth = 0,
): unknown {
  if (typeof value === "string") return redactString(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") {
    return String(value);
  }
  if (depth >= 5) return "[Truncated]";

  if (value instanceof Error) {
    return errorToLogMetadata(value);
  }

  if (typeof value !== "object") return redactString(String(value));
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map((item) => serializeForLog(item, seen, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key)
        ? REDACTED
        : serializeForLog(item, seen, depth + 1),
    ]),
  );
}

export function errorToLogMetadata(error: unknown): LogMetadata {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: redactString(error.message),
    };
  }

  return {
    errorType: typeof error,
    errorMessage: redactString(String(error)),
  };
}

function writeLog(level: LogLevel, message: string, metadata?: unknown): void {
  const entry: LogMetadata = {};

  if (metadata !== undefined) {
    const normalized = serializeForLog(metadata, new WeakSet());
    if (
      normalized &&
      typeof normalized === "object" &&
      !Array.isArray(normalized)
    ) {
      Object.assign(entry, normalized);
    } else {
      entry.context = normalized;
    }
  }

  Object.assign(entry, {
    timestamp: new Date().toISOString(),
    level,
    message: redactString(message),
  });

  const method = level === "info" ? "log" : level;
  console[method]("[CCW]", entry);
}

export const logger = {
  info: (message: string, metadata?: unknown) =>
    writeLog("info", message, metadata),
  warn: (message: string, metadata?: unknown) =>
    writeLog("warn", message, metadata),
  error: (message: string, metadata?: unknown) =>
    writeLog("error", message, metadata),
  debug: (message: string, metadata?: unknown) =>
    writeLog("debug", message, metadata),
};
