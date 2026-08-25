import { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseJson } from "@/lib/api/result";
import { auth } from "@/lib/auth";
import { webEnv } from "@/lib/env/web";
import dbConnect from "@/lib/mongodb";
import { getWebPushConfig } from "@/lib/push/config";
import { logger } from "@/lib/utils";
import PushSubscription from "@/models/PushSubscription";

const endpointSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "endpoint must be a valid HTTPS URL");

const subscriptionSchema = z.strictObject({
  endpoint: endpointSchema,
  expirationTime: z
    .number()
    .finite()
    .nonnegative()
    .max(8_640_000_000_000_000)
    .nullable()
    .optional(),
  keys: z.strictObject({
    p256dh: z
      .string()
      .trim()
      .min(16)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/),
    auth: z
      .string()
      .trim()
      .min(8)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/),
  }),
});

const deleteSchema = z.strictObject({ endpoint: endpointSchema });

export function isAllowedPushOrigin(
  origin: string | null,
  baseUrl: string,
  trustedOrigins: readonly string[],
) {
  if (origin === null) return false;
  const allowedOrigins = [baseUrl, ...trustedOrigins].map(
    (value) => new URL(value).origin,
  );
  return allowedOrigins.includes(origin);
}

function originAllowed(request: NextRequest) {
  return isAllowedPushOrigin(
    request.headers.get("origin"),
    webEnv.BASE_URL,
    webEnv.TRUSTED_ORIGINS,
  );
}

async function currentUserId(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await currentUserId(request);
    if (!userId) return jsonError("UNAUTHENTICATED", "Unauthorized");

    const config = getWebPushConfig();
    return jsonOk(
      config
        ? { configured: true, publicKey: config.publicKey }
        : { configured: false },
    );
  } catch (error) {
    logRouteFailure("GET", "read_push_configuration", error);
    return jsonError("INTERNAL_ERROR", "Unable to read push configuration.");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await currentUserId(request);
    if (!userId) return jsonError("UNAUTHENTICATED", "Unauthorized");
    if (!originAllowed(request)) {
      return jsonError("FORBIDDEN", "Request origin is not allowed.");
    }
    if (!getWebPushConfig()) {
      return jsonError(
        "SERVICE_UNAVAILABLE",
        "Browser notifications are not configured.",
      );
    }

    const parsed = await parseJson(request, subscriptionSchema);
    if (!parsed.ok) return jsonResult(parsed);

    await dbConnect();
    await PushSubscription.findOneAndUpdate(
      { endpoint: parsed.data.endpoint },
      {
        $set: {
          userId,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          expirationTime:
            parsed.data.expirationTime === null ||
            parsed.data.expirationTime === undefined
              ? null
              : new Date(parsed.data.expirationTime),
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    return jsonOk({ enabled: true });
  } catch (error) {
    logRouteFailure("PUT", "upsert_push_subscription", error);
    return jsonError("INTERNAL_ERROR", "Unable to save push subscription.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await currentUserId(request);
    if (!userId) return jsonError("UNAUTHENTICATED", "Unauthorized");
    if (!originAllowed(request)) {
      return jsonError("FORBIDDEN", "Request origin is not allowed.");
    }

    const parsed = await parseJson(request, deleteSchema);
    if (!parsed.ok) return jsonResult(parsed);

    await dbConnect();
    const result = await PushSubscription.deleteOne({
      userId,
      endpoint: parsed.data.endpoint,
    });
    return jsonOk({ enabled: false, deleted: result.deletedCount > 0 });
  } catch (error) {
    logRouteFailure("DELETE", "delete_push_subscription", error);
    return jsonError("INTERNAL_ERROR", "Unable to remove push subscription.");
  }
}

function logRouteFailure(method: string, operation: string, error: unknown) {
  logger.error("Push subscription route failed", {
    route: `${method} /api/push-subscriptions`,
    operation,
    errorName: error instanceof Error ? error.name : typeof error,
  });
}
