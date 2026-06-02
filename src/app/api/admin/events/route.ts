import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import Event from "@/models/Event";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();
    const events = await Event.find({})
      .select(
        "title shortDescription poster startDate endDate module tags recurrenceType recurrenceCount createdAt updatedAt",
      )
      .sort({ startDate: -1 })
      .lean();

    return NextResponse.json({ events: JSON.parse(JSON.stringify(events)) });
  } catch (err) {
    logger.error("[Admin Events API] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
