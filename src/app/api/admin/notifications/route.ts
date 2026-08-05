/**
 * POST /api/admin/notifications - Send notifications to users (admin only)
 *
 * Body:
 *   target: "all" | "module:<ModuleName>"
 *   title: string
 *   message: string
 *   link?: string
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import { notifyMany } from "@/lib/notify";
import User from "@/models/User";
import { MODULES } from "@/lib/constants";
import { errorToLogMetadata, logger } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const { target, title, message, link } = body;

    if (!target || !title || !message) {
      return NextResponse.json(
        { error: "target, title, and message are required." },
        { status: 400 },
      );
    }

    if (
      typeof title !== "string" ||
      title.trim().length === 0 ||
      title.length > 200
    ) {
      return NextResponse.json(
        { error: "Title must be 1-200 characters." },
        { status: 400 },
      );
    }

    if (
      typeof message !== "string" ||
      message.trim().length === 0 ||
      message.length > 1000
    ) {
      return NextResponse.json(
        { error: "Message must be 1-1000 characters." },
        { status: 400 },
      );
    }

    await dbConnect();

    let userFilter: Record<string, any> = {};

    if (target === "all") {
      userFilter = {};
    } else if (target.startsWith("module:")) {
      const moduleName = target.replace("module:", "");
      if (!MODULES.includes(moduleName as any)) {
        return NextResponse.json(
          { error: "Invalid module name." },
          { status: 400 },
        );
      }
      userFilter = { "roles.module": moduleName };
    } else {
      return NextResponse.json(
        { error: "Target must be 'all' or 'module:<name>'." },
        { status: 400 },
      );
    }

    const users = await User.find(userFilter).select("_id").lean();

    if (users.length === 0) {
      return NextResponse.json(
        { error: "No users match the target." },
        { status: 400 },
      );
    }

    const userIds = (users as any[]).map((u) => u._id.toString());

    await notifyMany(userIds, {
      type: "announcement",
      title: title.trim(),
      message: message.trim(),
      link: link || "",
    });

    return NextResponse.json({
      success: true,
      sent: userIds.length,
    });
  } catch (err) {
    logger.error("Admin notification dispatch failed", {
      route: "POST /api/admin/notifications",
      operation: "send_notifications",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
