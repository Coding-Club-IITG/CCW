import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import Event from "@/models/Event";
import CalendarEvent from "@/models/CalendarEvent";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    await dbConnect();
    void CalendarEvent;
    const event = await Event.findById(id).populate("calendarEventId").lean();
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    return NextResponse.json({ event: JSON.parse(JSON.stringify(event)) });
  } catch (err) {
    logger.error("[Admin Events API] GET [id] error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
