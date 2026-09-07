"use client";

import { useMemo, useState } from "react";
import { Flame } from "lucide-react";
import { type LeaderboardEntry } from "@/lib/actions/potd";

import MemberCell from "@/components/leaderboard/MemberCell";
import RankCell from "@/components/leaderboard/RankCell";
import EmptyState from "@/components/shared/EmptyState";
import SearchInput from "@/components/shared/SearchInput";
import SegmentedControl from "@/components/shared/SegmentedControl";

import styles from "../Lists.module.scss";

type Tab = "weekly" | "monthly";

const TABS = [
  { key: "weekly", label: "Past 1 Week" },
  { key: "monthly", label: "Past 1 Month" },
];

type Props = {
  initialWeekly: LeaderboardEntry[];
  initialMonthly: LeaderboardEntry[];
};

export default function LeaderboardClient({
  initialWeekly,
  initialMonthly,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("weekly");
  const [search, setSearch] = useState("");

  const data = activeTab === "weekly" ? initialWeekly : initialMonthly;
  const filteredData = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return data;
    }

    return data.filter((user) => {
      const name = user.name.toLowerCase();
      const handle = user.handle?.toLowerCase() ?? "";

      return name.includes(query) || handle.includes(query);
    });
  }, [data, search]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>POTD Leaderboard</h1>
        <p>Rankings based on Problem of the Day performance.</p>
      </div>

      <SegmentedControl
        label="Leaderboard period"
        segments={TABS.map((tab) => ({
          label: tab.label,
          active: activeTab === tab.key,
          onClick: () => setActiveTab(tab.key as Tab),
        }))}
      />

      <SearchInput
        placeholder="Search by name or handle..."
        value={search}
        onChange={setSearch}
      />

      <div className={styles.tableContainer}>
        {filteredData.length === 0 ? (
          <EmptyState
            title={
              data.length === 0
                ? "No data yet - start solving!"
                : "No matching members found."
            }
          />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Member</th>
                <th>Points</th>
                <th>Solved</th>
                <th className={styles.separatorCol}>Streak</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const ranks: number[] = [];

                filteredData.forEach((user, i) => {
                  if (i === 0) {
                    ranks.push(1);
                    return;
                  }

                  const prev = filteredData[i - 1];
                  const tied =
                    prev.totalPoints === user.totalPoints &&
                    prev.currentStreak === user.currentStreak;

                  ranks.push(tied ? ranks[i - 1] : i + 1);
                });

                return filteredData.map((user, index) => {
                  return (
                    <tr key={user.userId}>
                      <td>
                        <RankCell rank={ranks[index]} />
                      </td>
                      <td>
                        <MemberCell name={user.name} handle={user.handle} />
                      </td>
                      <td>
                        <span className={styles.points}>
                          {user.totalPoints.toLocaleString()}
                        </span>
                      </td>
                      <td className={styles.subText}>{user.totalSolved}</td>
                      <td className={styles.separatorCol}>
                        {user.currentStreak > 0 ? (
                          <span className={styles.streak}>
                            <Flame size={14} aria-hidden="true" />
                            {user.currentStreak}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
