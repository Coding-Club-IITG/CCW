"use client";

import { useState } from "react";

import { PLATFORM_DISPLAY_NAMES, PLATFORM_PROFILE_URLS } from "@/lib/constants";
import type { Platform } from "@/lib/constants";

import LeaderboardTable, {
  type Column,
  leaderboardStyles as styles,
} from "@/components/leaderboard/LeaderboardTable";
import MemberCell from "@/components/leaderboard/MemberCell";
import RankCell from "@/components/leaderboard/RankCell";
import SearchInput from "@/components/shared/SearchInput";
import SegmentedControl from "@/components/shared/SegmentedControl";

export type RatingLeaderboardEntry = {
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
      render: (_item, index) => <RankCell rank={index + 1} />,
    },
    {
      key: "member",
      header: "Member",
      render: (item) => <MemberCell name={item.name} />,
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
      <LeaderboardTable
        title={`${PLATFORM_DISPLAY_NAMES[platform]} Leaderboard`}
        description="Current member standings."
        columns={columns}
        data={filteredEntries}
        getKey={(item) => item.id}
        emptyMessage="No data available yet. Ratings sync every 6 hours."
        toolbar={
          <>
            <SegmentedControl
              label="Rating platform"
              segments={TABS.map((tab) => ({
                label: tab.label,
                active: platform === tab.key,
                onClick: () => setPlatform(tab.key as Platform),
              }))}
            />
            <SearchInput
              placeholder="Search by name or handle"
              value={search}
              onChange={setSearch}
            />
          </>
        }
      />
    </div>
  );
}
