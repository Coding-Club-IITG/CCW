import { z } from "zod";

export const APP_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "EXTERNAL_DEPENDENCY_FAILURE",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export type AppError = {
  code: AppErrorCode;
  message: string;
  fields?: Record<string, string[]>;
  requestId?: string;
};

export type AppResult<T> =
  { ok: true; data: T } | { ok: false; error: AppError };

export const HTTP_STATUS_BY_ERROR_CODE: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  EXTERNAL_DEPENDENCY_FAILURE: 502,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export function ok<T>(data: T): AppResult<T> {
  return { ok: true, data };
}

export function err(
  code: AppErrorCode,
  message: string,
  options: Pick<AppError, "fields" | "requestId"> = {},
): AppResult<never> {
  return { ok: false, error: { code, message, ...options } };
}

export function requestIdFrom(request?: Request): string {
  const supplied = request?.headers.get("x-request-id")?.trim();
  return supplied && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied)
    ? supplied
    : globalThis.crypto.randomUUID();
}

export function zodIssuesToFields(
  issues: readonly z.core.$ZodIssue[],
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const name = issue.path.length ? issue.path.join(".") : "_form";
    (fields[name] ??= []).push(issue.message);
  }
  return fields;
}

export function validationError(error: z.ZodError): AppResult<never> {
  return err("VALIDATION_ERROR", "The submitted data is invalid.", {
    fields: zodIssuesToFields(error.issues),
  });
}

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<AppResult<T>> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return err("VALIDATION_ERROR", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(input);
  return parsed.success ? ok(parsed.data) : validationError(parsed.error);
}

function formDataObject(formData: FormData): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const [key, item] of formData.entries()) {
    const previous = value[key];
    value[key] =
      previous === undefined
        ? item
        : Array.isArray(previous)
          ? [...previous, item]
          : [previous, item];
  }
  return value;
}

export function parseFormData<T>(
  formData: FormData,
  schema: z.ZodType<T>,
): AppResult<T> {
  const parsed = schema.safeParse(formDataObject(formData));
  return parsed.success ? ok(parsed.data) : validationError(parsed.error);
}

export function parseSearchParams<T>(
  searchParams: URLSearchParams,
  schema: z.ZodType<T>,
): AppResult<T> {
  const input: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    input[key] = values.length > 1 ? values : (values[0] ?? "");
  }
  const parsed = schema.safeParse(input);
  return parsed.success ? ok(parsed.data) : validationError(parsed.error);
}

export function parseRouteParams<T>(
  params: unknown,
  schema: z.ZodType<T>,
): AppResult<T> {
  const parsed = schema.safeParse(params);
  return parsed.success ? ok(parsed.data) : validationError(parsed.error);
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** Convert BSON/Mongoose values into explicitly JSON-safe plain values */
export function toBsonSafe(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    "toHexString" in value &&
    typeof (value as { toHexString?: unknown }).toHexString === "function"
  ) {
    return (value as { toHexString: () => string }).toHexString();
  }
  if (value instanceof Uint8Array) {
    let binary = "";
    for (const byte of value) binary += String.fromCharCode(byte);
    return globalThis.btoa(binary);
  }
  if (Array.isArray(value)) return value.map(toBsonSafe);
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([key, item]) => [
        String(key),
        toBsonSafe(item),
      ]),
    );
  }
  if (typeof value === "object") {
    const candidate = value as { toObject?: () => unknown };
    const plain =
      typeof candidate.toObject === "function" ? candidate.toObject() : value;
    return Object.fromEntries(
      Object.entries(plain as Record<string, unknown>)
        .filter(([, item]) => item !== undefined && typeof item !== "function")
        .map(([key, item]) => [key, toBsonSafe(item)]),
    );
  }
  return String(value);
}

export async function readAppResult<T>(
  response: Response,
): Promise<AppResult<T>> {
  try {
    const result: unknown = await response.json();
    if (
      result &&
      typeof result === "object" &&
      "ok" in result &&
      typeof (result as { ok?: unknown }).ok === "boolean"
    ) {
      return result as AppResult<T>;
    }
  } catch {
    // Normalize non-JSON or malformed upstream responses below
  }
  return err("INTERNAL_ERROR", "The server returned an invalid response.");
}

export class AppResultError extends Error {
  constructor(public readonly detail: AppError) {
    super(detail.message);
    this.name = "AppResultError";
  }
}

export function appErrorMessage(error: unknown, fallback: string): string {
  return error instanceof AppResultError ? error.detail.message : fallback;
}

/** Read the shared envelope and return its typed data, throwing a safe application error on failure */
export async function expectAppData<T = any>(response: Response): Promise<T> {
  const result = await readAppResult<T>(response);
  if (!result.ok) throw new AppResultError(result.error);
  return result.data;
}

export function resultMessage(
  result: AppResult<unknown>,
  fallback: string,
): string {
  return result.ok ? fallback : result.error.message;
}
