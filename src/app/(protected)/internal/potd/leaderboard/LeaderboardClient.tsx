"use client";

import { useMemo, useState } from "react";
import SearchInput from "@/components/shared/SearchInput";
import PlatformTabs from "@/components/shared/PlatformTabs";
import { type LeaderboardEntry } from "@/lib/actions/potd";
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

      <PlatformTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as Tab)}
      />

      <SearchInput
        placeholder="Search by name or handle..."
        value={search}
        onChange={setSearch}
      />

      <div className={styles.tableContainer}>
        {filteredData.length === 0 ? (
          <p className={styles.emptyState}>
            {data.length === 0
              ? "No data yet - start solving!"
              : "No matching members found."}
          </p>
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
                  const rank = ranks[index];
                  let rankClass = "";
                  if (rank === 1) rankClass = styles.top1;
                  if (rank === 2) rankClass = styles.top2;
                  if (rank === 3) rankClass = styles.top3;

                  return (
                    <tr key={user.userId}>
                      <td>
                        <span
                          className={`${styles.rank} ${rankClass ? styles.rankBadge : ""} ${rankClass}`}
                        >
                          {String(rank).padStart(2, "0")}
                        </span>
                      </td>
                      <td>
                        <div className={styles.userInfo}>
                          <span className={styles.userName}>{user.name}</span>
                          {user.handle && (
                            <span className={styles.userHandle}>
                              @{user.handle}
                            </span>
                          )}
                        </div>
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
                            🔥 {user.currentStreak}
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
