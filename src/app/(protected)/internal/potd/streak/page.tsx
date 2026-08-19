import StreakLeaderboardClient from "./StreakLeaderboardClient";
import { getStreakLeaderboard } from "@/lib/actions/potd";

export default async function StreakLeaderboardPage() {
  const result = await getStreakLeaderboard();
  return <StreakLeaderboardClient initialData={result.ok ? result.data : []} />;
}
