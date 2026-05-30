import { NextResponse } from "next/server";
import Contest from "@/models/Contest";
import dbConnect from "@/lib/mongodb";

export async function GET() {
  await dbConnect();

  const now = new Date();
  const contests = await Contest.find({ startTime: { $gte: now } })
    .sort({ startTime: 1 })
    .lean();

  return NextResponse.json(
    contests.map((c: any) => ({
      id: c._id.toString(),
      platform: c.platform,
      name: c.name,
      startTime: c.startTime.toISOString(),
      endTime: c.endTime.toISOString(),
      durationSeconds: c.durationSeconds,
      url: c.url,
    })),
  );
}
