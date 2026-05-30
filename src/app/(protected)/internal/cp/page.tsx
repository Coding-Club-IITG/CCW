import CPUser from "@/models/CPUser";
import Contest from "@/models/Contest";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import CPPageClient from "@/components/cp/CPPageClient";
import { getDisplayName } from "@/lib/utils";

type RatingLeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  rating: number;
  rank: string;
};

async function getCFLeaderboard(): Promise<RatingLeaderboardEntry[]> {
  await dbConnect();

  const data = await CPUser.find({
    cfVerified: true,
    cfRating: { $gt: 0 },
  })
    .sort({ cfRating: -1 })
    .populate({
      path: "userId",
      model: User,
      select: "name pizza_count",
    })
    .lean();

  return data.map((entry: any) => ({
    id: entry._id.toString(),
    name: getDisplayName(
      entry.userId?.name || "Unknown",
      entry.userId?.pizza_count,
    ),
    handle: entry.cfHandle,
    rating: entry.cfRating,
    rank: entry.cfRank,
  }));
}

async function getACLeaderboard(): Promise<RatingLeaderboardEntry[]> {
  await dbConnect();

  const data = await CPUser.find({
    acVerified: true,
    acRating: { $gt: 0 },
  })
    .sort({ acRating: -1 })
    .populate({
      path: "userId",
      model: User,
      select: "name pizza_count",
    })
    .lean();

  return data.map((entry: any) => ({
    id: entry._id.toString(),
    name: getDisplayName(
      entry.userId?.name || "Unknown",
      entry.userId?.pizza_count,
    ),
    handle: entry.acHandle,
    rating: entry.acRating,
    rank: entry.acRank,
  }));
}

async function getContests() {
  await dbConnect();

  // Exclude contests longer than 24 hours
  const MAX_DURATION = 24 * 60 * 60;
  const contests = await Contest.find({
    durationSeconds: { $lte: MAX_DURATION },
  })
    .sort({ startTime: 1 })
    .lean();

  return contests.map((c: any) => ({
    id: c._id.toString(),
    platform: c.platform,
    name: c.name,
    startTime: c.startTime.toISOString(),
    endTime: c.endTime.toISOString(),
    durationSeconds: c.durationSeconds,
    url: c.url,
  }));
}

export default async function CPPage() {
  const [cfEntries, acEntries, contests] = await Promise.all([
    getCFLeaderboard(),
    getACLeaderboard(),
    getContests(),
  ]);

  return (
    <CPPageClient
      cfEntries={cfEntries}
      acEntries={acEntries}
      contests={contests}
    />
  );
}
