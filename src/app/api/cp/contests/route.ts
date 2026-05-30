import { NextResponse } from "next/server";
import Contest from "@/models/Contest";
import dbConnect from "@/lib/mongodb";

export async function GET() {
  await dbConnect();

  // Exclude contests longer than 24 hours
  const MAX_DURATION = 24 * 60 * 60;
  const contests = await Contest.find({
    durationSeconds: { $lte: MAX_DURATION },
  })
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
