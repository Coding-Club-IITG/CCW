/**
 * GET /api/hackathons - List active hackathons
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Hackathon from "@/models/Hackathon";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const hackathons = await Hackathon.find({ status: "active" })
      .sort({ deadline: 1 })
      .lean();

    return NextResponse.json({ hackathons });
  } catch (err) {
    console.error("[Hackathons] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
