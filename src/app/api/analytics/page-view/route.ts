import { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api/result.server";
import { VISITOR_COOKIE_MAX_AGE, VISITOR_COOKIE_NAME } from "@/lib/constants";
import { webEnv } from "@/lib/env/web";
import {
  publicAnalyticsEnabled,
  publicPageViewSchema,
  recordPublicPageView,
  visitorIdentity,
} from "@/lib/telemetry/publicPageViews";
import { logger } from "@/lib/telemetry/logger";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 1024;

/** Anonymous, same-origin collection for the public site */
export async function POST(request: NextRequest) {
  if (
    !publicAnalyticsEnabled() ||
    request.headers.get("dnt") === "1" ||
    request.headers.get("sec-gpc") === "1"
  ) {
    return jsonOk({ accepted: false, needsCookie: false }, { headers });
  }
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    new URL(webEnv.BASE_URL).origin,
    ...webEnv.TRUSTED_ORIGINS,
  ];
  if (
    !origin ||
    !allowedOrigins.includes(origin) ||
    (request.headers.has("sec-fetch-site") &&
      request.headers.get("sec-fetch-site") !== "same-origin")
  ) {
    return jsonError("FORBIDDEN", "A same-origin request is required.", {
      headers,
    });
  }
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    return jsonError("VALIDATION_ERROR", "Expected JSON.", { headers });
  }

  let input: unknown;
  try {
    if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES)
      throw new Error();
    // Bound streamed bodies too
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return jsonError("VALIDATION_ERROR", "Invalid page view.", { headers });
  }
  const parsed = publicPageViewSchema.safeParse(input);
  if (!parsed.success)
    return jsonError("VALIDATION_ERROR", "Invalid page view.", { headers });

  const visitor = visitorIdentity(
    request.cookies.get(VISITOR_COOKIE_NAME)?.value,
  );
  if (visitor.isNew) {
    const response = jsonOk(
      { accepted: false, needsCookie: true },
      { headers },
    );
    response.cookies.set(VISITOR_COOKIE_NAME, visitor.id, {
      httpOnly: true,
      secure: webEnv.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/analytics",
      maxAge: VISITOR_COOKIE_MAX_AGE,
    });
    return response;
  }
  try {
    const accepted = await recordPublicPageView(visitor.key, parsed.data);
    return jsonOk({ accepted, needsCookie: false }, { headers });
  } catch {
    logger.warn("Public analytics unavailable", {
      operation: "record-public-page-view",
    });
    return jsonOk({ accepted: false, needsCookie: false }, { headers });
  }
}
