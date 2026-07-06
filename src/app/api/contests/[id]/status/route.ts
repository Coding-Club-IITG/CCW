import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import ContestMatch from "@/models/ContestMatch";
import { publishContest } from "@/lib/sse";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Action is required" },
        { status: 400 },
      );
    }

    await dbConnect();
    const contest = await ContestMatch.findById(id);
    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    let newStatus: "draft" | "registration" | "active" | "completed";

    if (action === "publish") {
      if (contest.status !== "draft") {
        return NextResponse.json(
          { error: "Invalid status transition" },
          { status: 400 },
        );
      }
      newStatus = "registration";
    } else if (action === "start") {
      if (contest.status !== "registration") {
        return NextResponse.json(
          { error: "Invalid status transition" },
          { status: 400 },
        );
      }
      newStatus = "active";
    } else if (action === "complete") {
      if (contest.status !== "active") {
        return NextResponse.json(
          { error: "Invalid status transition" },
          { status: 400 },
        );
      }
      newStatus = "completed";
    } else {
      return NextResponse.json(
        { error: "Invalid status transition" },
        { status: 400 },
      );
    }

    contest.status = newStatus;
    await contest.save();

    // Publish SSE update
    try {
      await publishContest(contest._id.toString(), {
        type: "contest.status_change",
        status: newStatus,
      });
    } catch (sseError) {
      console.error("Failed to publish SSE status change:", sseError);
    }

    return NextResponse.json(contest);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
