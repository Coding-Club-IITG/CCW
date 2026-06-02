import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import Project from "@/models/Project";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();
    const projects = await Project.find({})
      .select(
        "title description date module status repoLink coverImage tags createdAt updatedAt",
      )
      .sort({ date: -1 })
      .lean();

    return NextResponse.json({
      projects: JSON.parse(JSON.stringify(projects)),
    });
  } catch (err) {
    logger.error("[Admin Projects API] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
