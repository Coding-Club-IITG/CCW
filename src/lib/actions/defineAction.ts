import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { type AppResult, err as appError } from "@/lib/api/result";
import { logBoundaryFailure, mongoErrorResult } from "@/lib/api/result.server";

/** Add consistent exception handling to an action that returns AppResult */
export function defineAction<Args extends unknown[], Data>(
  operation: string,
  action: (...args: Args) => Promise<AppResult<Data>>,
): (...args: Args) => Promise<AppResult<Data>> {
  return async (...args: Args) => {
    try {
      return await action(...args);
    } catch (error) {
      unstable_rethrow(error);
      const mapped = mongoErrorResult(error);
      if (!mapped.ok && mapped.error.code !== "INTERNAL_ERROR") return mapped;
      const requestId = randomUUID();
      logBoundaryFailure(operation, error, requestId);
      return appError("INTERNAL_ERROR", "An unexpected error occurred.", {
        requestId,
      });
    }
  };
}
