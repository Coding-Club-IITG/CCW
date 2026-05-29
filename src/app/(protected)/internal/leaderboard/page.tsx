import CPUser from "@/models/CPUser";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import RatingLeaderboardClient from "@/components/leaderboard/RatingLeaderboardClient";

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

export default async function LeaderboardPage() {
  const [cfEntries, acEntries] = await Promise.all([
    getCFLeaderboard(),
    getACLeaderboard(),
  ]);

  return (
    <RatingLeaderboardClient
      cfEntries={cfEntries}
      acEntries={acEntries}
    />
  );
}
