/**
 * GET   /api/notifications - List notifications for current user
 * PATCH /api/notifications - Mark notifications as read
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseJson, parseSearchParams } from "@/lib/api/result";
import {
  jsonObjectSchema,
  optionalSearchQuerySchema,
  paginationQueryFields,
} from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import { prepareSearchQuery } from "@/lib/search";
import { logger } from "@/lib/utils";
import Notification from "@/models/Notification";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const userId = session.user.id;
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const query = parseSearchParams(
      searchParams,
      z.object({
        ...paginationQueryFields,
        unread: z.enum(["true", "false"]).optional(),
        search: optionalSearchQuerySchema,
      }),
    );
    if (!query.ok) return jsonResult(query);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 30 });
    const unreadOnly = query.data.unread === "true";

    const filter: Record<string, unknown> = { userId };
    if (unreadOnly) {
      filter.read = false;
    }

    const searchQuery = prepareSearchQuery(query.data.search);
    if (searchQuery) {
      const regex = { $regex: searchQuery.pattern, $options: "i" };
      filter.$or = [{ title: regex }, { message: regex }];
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId, read: false }),
    ]);

    return jsonOk({
      ...paginatedResponse(notifications, total, page, limit),
      unreadCount,
    });
  } catch (err) {
    logger.error("[Notifications] GET error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const userId = session.user.id;
    await dbConnect();

    const result = await Notification.deleteMany({
      userId,
      read: true,
    });

    return jsonOk({ success: true, deleted: result.deletedCount });
  } catch (err) {
    logger.error("[Notifications] DELETE error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const userId = session.user.id;
    await dbConnect();

    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;

    const { ids, all } = body;

    if (all) {
      await Notification.updateMany({ userId, read: false }, { read: true });
    } else if (Array.isArray(ids) && ids.length > 0) {
      await Notification.updateMany(
        { _id: { $in: ids }, userId },
        { read: true },
      );
    } else {
      return jsonError(
        "VALIDATION_ERROR",
        "Provide 'ids' array or 'all: true'.",
      );
    }

    return jsonOk({ success: true });
  } catch (err) {
    logger.error("[Notifications] PATCH error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
