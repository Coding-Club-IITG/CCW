/**
 * GET /api/hackathons/users?q=search - Search members for team invites
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";

    if (q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    await dbConnect();

    const users = await User.find({
      name: { $regex: q, $options: "i" },
    })
      .select("_id name email pizza_count")
      .limit(20)
      .lean();

    return NextResponse.json({
      users: (users as any[]).map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        pizza_count: u.pizza_count,
      })),
    });
  } catch (err) {
    console.error("[Hackathon Users] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
