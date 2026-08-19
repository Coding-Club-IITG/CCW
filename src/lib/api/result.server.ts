import { MongoServerError, ObjectId } from "mongodb";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { errorToLogMetadata, logger } from "@/lib/logger";
import {
  HTTP_STATUS_BY_ERROR_CODE,
  type AppErrorCode,
  type AppResult,
  err,
  ok,
  requestIdFrom,
} from "@/lib/api/result";

export function jsonOk<T>(
  data: T,
  init: ResponseInit = {},
): NextResponse<AppResult<T>> {
  return NextResponse.json(ok(data), init);
}

export function jsonResult<T>(
  result: AppResult<T>,
  init: ResponseInit = {},
): NextResponse<AppResult<T>> {
  if (result.ok) return jsonOk(result.data, init);
  return jsonError(result.error.code, result.error.message, {
    fields: result.error.fields,
    requestId: result.error.requestId,
    headers: init.headers,
  });
}

export function jsonError(
  code: AppErrorCode,
  message: string,
  options: {
    fields?: Record<string, string[]>;
    requestId?: string;
    headers?: HeadersInit;
  } = {},
): NextResponse<AppResult<never>> {
  const requestId =
    options.requestId ??
    (code === "INTERNAL_ERROR" ? requestIdFrom() : undefined);
  const headers = new Headers(options.headers);
  if (requestId) headers.set("x-request-id", requestId);
  return NextResponse.json(
    err(
      code,
      code === "INTERNAL_ERROR" ? "An unexpected error occurred." : message,
      {
        fields: options.fields,
        requestId,
      },
    ),
    { status: HTTP_STATUS_BY_ERROR_CODE[code], headers },
  );
}

export function parseObjectId(
  value: unknown,
  field = "id",
): AppResult<ObjectId> {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    return err("VALIDATION_ERROR", `Invalid ${field}.`, {
      fields: {
        [field]: [`${field} must be a 24-character hexadecimal ObjectId.`],
      },
    });
  }
  return ok(new ObjectId(value));
}

export function mongoErrorResult(error: unknown): AppResult<never> {
  if (error instanceof MongoServerError && error.code === 11000) {
    const fields = Object.keys(
      (error as MongoServerError & { keyPattern?: Record<string, unknown> })
        .keyPattern ?? {},
    );
    return err(
      "CONFLICT",
      "A record with these values already exists.",
      fields.length
        ? {
            fields: Object.fromEntries(
              fields.map((field) => [field, ["Must be unique."]]),
            ),
          }
        : {},
    );
  }
  if (error instanceof mongoose.Error.ValidationError) {
    return err("VALIDATION_ERROR", "The submitted data is invalid.", {
      fields: Object.fromEntries(
        Object.entries(error.errors).map(([field]) => [
          field,
          ["Invalid value."],
        ]),
      ),
    });
  }
  if (error instanceof mongoose.Error.CastError) {
    return err("VALIDATION_ERROR", "The submitted data is invalid.", {
      fields: { [error.path || "_form"]: ["Invalid value."] },
    });
  }
  return err("INTERNAL_ERROR", "An unexpected error occurred.");
}

export function logBoundaryFailure(
  operation: string,
  error: unknown,
  requestId: string,
): void {
  logger.error("Boundary operation failed", {
    operation,
    requestId,
    ...errorToLogMetadata(error),
  });
}

export function boundaryErrorResponse(
  operation: string,
  error: unknown,
  request?: Request,
): NextResponse<AppResult<never>> {
  const mapped = mongoErrorResult(error);
  if (!mapped.ok && mapped.error.code !== "INTERNAL_ERROR") {
    return jsonError(mapped.error.code, mapped.error.message, {
      fields: mapped.error.fields,
    });
  }
  const requestId = requestIdFrom(request);
  logBoundaryFailure(operation, error, requestId);
  return jsonError("INTERNAL_ERROR", "An unexpected error occurred.", {
    requestId,
  });
}
