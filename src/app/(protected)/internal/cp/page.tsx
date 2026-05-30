import CPUser from "@/models/CPUser";
import Contest from "@/models/Contest";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import CPPageClient from "@/components/cp/CPPageClient";

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
      select: "name",
    })
    .lean();

  return data.map((entry: any) => ({
    id: entry._id.toString(),
    name: entry.userId?.name || "Unknown",
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
      select: "name",
    })
    .lean();

  return data.map((entry: any) => ({
    id: entry._id.toString(),
    name: entry.userId?.name || "Unknown",
    handle: entry.acHandle,
    rating: entry.acRating,
    rank: entry.acRank,
  }));
}

async function getUpcomingContests() {
  await dbConnect();

  const now = new Date();
  const contests = await Contest.find({ startTime: { $gte: now } })
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
    getUpcomingContests(),
  ]);

  return (
    <CPPageClient
      cfEntries={cfEntries}
      acEntries={acEntries}
      contests={contests}
    />
  );
}
