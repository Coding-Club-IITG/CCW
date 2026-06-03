"use client";

import { useState } from "react";
import LeaderboardTable, {
  type Column,
  leaderboardStyles as styles,
} from "@/components/leaderboard/LeaderboardTable";
import PlatformTabs from "@/components/shared/PlatformTabs";
import SearchInput from "@/components/shared/SearchInput";
import { PLATFORM_DISPLAY_NAMES, PLATFORM_PROFILE_URLS } from "@/lib/constants";
import type { Platform } from "@/lib/constants";

type RatingLeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  rating: number;
  rank: string;
};

type Props = {
  cfEntries: RatingLeaderboardEntry[];
  acEntries: RatingLeaderboardEntry[];
};

const TABS = [
  { key: "codeforces", label: "Codeforces" },
  { key: "atcoder", label: "AtCoder" },
];

export default function RatingLeaderboardClient({
  cfEntries,
  acEntries,
}: Props) {
  const [platform, setPlatform] = useState<Platform>("codeforces");
  const [search, setSearch] = useState("");

  const entries = platform === "codeforces" ? cfEntries : acEntries;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredEntries = normalizedSearch
    ? entries.filter((entry) => {
        const name = entry.name.toLowerCase();
        const handle = entry.handle.toLowerCase();

        return (
          name.includes(normalizedSearch) || handle.includes(normalizedSearch)
        );
      })
    : entries;

  const columns: Column<RatingLeaderboardEntry>[] = [
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
          href={PLATFORM_PROFILE_URLS[platform](item.handle)}
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
      key: "platformRank",
      header: `${PLATFORM_DISPLAY_NAMES[platform]} Rank`,
      render: (item) => <span className={styles.cpRank}>{item.rank}</span>,
    },
  ];

  return (
    <div>
      <PlatformTabs
        tabs={TABS}
        activeTab={platform}
        onTabChange={(key) => setPlatform(key as Platform)}
      />
      <LeaderboardTable
        title={`${PLATFORM_DISPLAY_NAMES[platform]} Leaderboard`}
        description="Current standings of coding club members."
        columns={columns}
        data={filteredEntries}
        getKey={(item) => item.id}
        emptyMessage="No data available yet. Ratings sync every 6 hours."
        toolbar={
          <SearchInput
            placeholder="Search by name or handle"
            value={search}
            onChange={setSearch}
          />
        }
      />
    </div>
  );
}
