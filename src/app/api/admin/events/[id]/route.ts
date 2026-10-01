import { NextRequest } from "next/server";

import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseRouteParams, toBsonSafe } from "@/lib/api/result";
import { requireHead } from "@/lib/auth/session";
import { objectIdParamsSchema } from "@/lib/api/schemas/boundary";
import { connectMongoDB } from "@/lib/db/mongodb";
import { logger } from "@/lib/telemetry/logger";

import Event from "@/models/Event";
import CalendarEvent from "@/models/CalendarEvent";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);

    const validatedParams = parseRouteParams(
      await context.params,
      objectIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;
    await connectMongoDB();
    void CalendarEvent;
    const event = await Event.findById(id).populate("calendarEventId").lean();
    if (!event) {
      return jsonError("NOT_FOUND", "Event not found.");
    }

    return jsonOk({ event: toBsonSafe(event) });
  } catch (err) {
    logger.error("[Admin Events API] GET [id] error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
