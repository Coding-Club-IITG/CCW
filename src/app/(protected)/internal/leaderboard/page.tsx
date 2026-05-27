import CFUser from "@/models/CFUser";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import LeaderboardTable, {
  type Column,
  leaderboardStyles as styles,
} from "@/components/leaderboard/LeaderboardTable";

type CFLeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  rating: number;
  rank: string;
};

export default async function LeaderboardPage() {
  await dbConnect();

  const leaderboardData = await CFUser.find({
    cfVerified: true,
    rating: { $gt: 0 },
  })
    .sort({ rating: -1 })
    .populate({
      path: "userId",
      model: User,
      select: "name",
    })
    .lean();

  const entries: CFLeaderboardEntry[] = leaderboardData.map((entry: any) => ({
    id: entry._id.toString(),
    name: entry.userId?.name || "Unknown",
    handle: entry.handle,
    rating: entry.rating,
    rank: entry.rank,
  }));

  const columns: Column<CFLeaderboardEntry>[] = [
    {
      key: "rank",
      header: "Rank",
      render: (_item, index) => {
        const rank = index + 1;
        let rankClass = "";
        if (rank === 1) rankClass = styles.top1;
        else if (rank === 2) rankClass = styles.top2;
        else if (rank === 3) rankClass = styles.top3;

        return (
          <span
            className={`${styles.rank} ${rankClass ? styles.rankBadge : ""} ${rankClass}`}
          >
            {rank}
          </span>
        );
      },
    },
    {
      key: "member",
      header: "Member",
      render: (item) => (
        <div className={styles.userInfo}>
          <span className={styles.userName}>{item.name}</span>
        </div>
      ),
    },
    {
      key: "handle",
      header: "Handle",
      render: (item) => (
        <a
          href={`https://codeforces.com/profile/${item.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.handleLink}
        >
          {item.handle}
        </a>
      ),
    },
    {
      key: "rating",
      header: "Rating",
      render: (item) => (
        <span className={styles.ratingBadge}>{item.rating}</span>
      ),
    },
    {
      key: "cfRank",
      header: "CF Rank",
      render: (item) => <span className={styles.cfRank}>{item.rank}</span>,
    },
  ];

  return (
    <LeaderboardTable
      title="Codeforces Leaderboard"
      description="Current standings of coding club members."
      columns={columns}
      data={entries}
      getKey={(item) => item.id}
      emptyMessage="No data available yet. Ratings sync every 6 hours."
    />
  );
}
