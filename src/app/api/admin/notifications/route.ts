/**
 * POST /api/admin/notifications - Send notifications to users (admin only)
 *
 * Body:
 *   target: "all" | "module:<ModuleName>"
 *   title: string
 *   message: string
 *   link?: string
 */

import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeNotification } from "@/lib/audit/summary";
import { requireHead } from "@/lib/api/auth";
import { parseJson } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { jsonObjectSchema } from "@/lib/api/schemas/boundary";
import { MODULES } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { enqueuePushNotifications, notifyMany } from "@/lib/notify";
import { errorToLogMetadata, logger } from "@/lib/utils";
import User from "@/models/User";

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);

    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;

    const { target, title, message, link } = body;

    if (
      typeof target !== "string" ||
      !target ||
      typeof title !== "string" ||
      !title ||
      typeof message !== "string" ||
      !message
    ) {
      return jsonError(
        "VALIDATION_ERROR",
        "target, title, and message are required.",
      );
    }

    if (
      typeof title !== "string" ||
      title.trim().length === 0 ||
      title.length > 200
    ) {
      return jsonError("VALIDATION_ERROR", "Title must be 1-200 characters.");
    }

    if (
      typeof message !== "string" ||
      message.trim().length === 0 ||
      message.length > 1000
    ) {
      return jsonError(
        "VALIDATION_ERROR",
        "Message must be 1-1000 characters.",
      );
    }

    await dbConnect();

    let userFilter: Record<string, any> = {};

    if (target === "all") {
      userFilter = {};
    } else if (target.startsWith("module:")) {
      const moduleName = target.replace("module:", "");
      if (!MODULES.includes(moduleName as any)) {
        return jsonError("VALIDATION_ERROR", "Invalid module name.");
      }
      userFilter = { "roles.module": moduleName };
    } else {
      return jsonError(
        "VALIDATION_ERROR",
        "Target must be 'all' or 'module:<name>'.",
      );
    }

    const users = await User.find(userFilter).select("_id").lean();

    if (users.length === 0) {
      return jsonError("VALIDATION_ERROR", "No users match the target.");
    }

    const userIds = (users as any[]).map((u) => u._id.toString());

    const transaction = await mongoose.startSession();
    let notificationIds: string[] = [];
    try {
      notificationIds = await auditedTransaction(
        transaction,
        async (dbSession) => {
          const created = await notifyMany(
            userIds,
            {
              type: "announcement",
              title: title.trim(),
              message: message.trim(),
              link: typeof link === "string" ? link : "",
            },
            { session: dbSession, enqueue: false },
          );
          return {
            result: created.map((notification) => String(notification._id)),
            audit: {
              actor: auditActor(authorization.data.user),
              category: "notifications" as const,
              action: "broadcast" as const,
              operation: "notifications.broadcast",
              target: {
                type: "notification-broadcast",
                id: crypto.randomUUID(),
                label: title.trim(),
              },
              after: summarizeNotification({
                target,
                type: "announcement",
                title: title.trim(),
                recipientCount: userIds.length,
                link,
              }),
            },
          };
        },
      );
    } finally {
      await transaction.endSession();
    }
    await enqueuePushNotifications(notificationIds);

    return jsonOk({
      success: true,
      sent: userIds.length,
    });
  } catch (err) {
    logger.error("Admin notification dispatch failed", {
      route: "POST /api/admin/notifications",
      operation: "send_notifications",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
