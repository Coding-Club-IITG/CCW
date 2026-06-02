/**
 * PATCH  /api/admin/hackathons/[id] - Update a hackathon (admin only)
 * DELETE /api/admin/hackathons/[id] - Archive a hackathon (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import Hackathon from "@/models/Hackathon";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    await dbConnect();

    const allowed = [
      "name",
      "organization",
      "minMembers",
      "maxMembers",
      "skills",
      "websiteUrl",
      "deadline",
      "description",
      "status",
    ];
    const update: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        update[key] = body[key];
      }
    }

    if (update.deadline) {
      update.deadline = new Date(update.deadline);
    }

    const hackathon = await Hackathon.findByIdAndUpdate(id, update, {
      new: true,
    }).lean();
    if (!hackathon) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({ hackathon });
  } catch (err) {
    console.error("[Hackathon Admin] PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await dbConnect();

    // Soft archive instead of hard delete
    const hackathon = await Hackathon.findByIdAndUpdate(
      id,
      { status: "archived" },
      { new: true },
    ).lean();

    if (!hackathon) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({ hackathon });
  } catch (err) {
    console.error("[Hackathon Admin] DELETE error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
