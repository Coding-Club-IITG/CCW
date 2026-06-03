/**
 * GET   /api/notifications - List notifications for current user
 * PATCH /api/notifications - Mark notifications as read
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import Notification from "@/models/Notification";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 30 });
    const unreadOnly = searchParams.get("unread") === "true";

    const filter: Record<string, any> = { userId: user.id };
    if (unreadOnly) {
      filter.read = false;
    }

    const searchQuery = searchParams.get("search");
    if (searchQuery) {
      const regex = { $regex: searchQuery, $options: "i" };
      filter.$or = [{ title: regex }, { message: regex }];
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: user.id, read: false }),
    ]);

    return NextResponse.json({
      ...paginatedResponse(notifications, total, page, limit),
      unreadCount,
    });
  } catch (err) {
    console.error("[Notifications] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    await dbConnect();

    const result = await Notification.deleteMany({
      userId: user.id,
      read: true,
    });

    return NextResponse.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("[Notifications] DELETE error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    await dbConnect();

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const { ids, all } = body;

    if (all) {
      await Notification.updateMany(
        { userId: user.id, read: false },
        { read: true },
      );
    } else if (Array.isArray(ids) && ids.length > 0) {
      await Notification.updateMany(
        { _id: { $in: ids }, userId: user.id },
        { read: true },
      );
    } else {
      return NextResponse.json(
        { error: "Provide 'ids' array or 'all: true'." },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Notifications] PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
