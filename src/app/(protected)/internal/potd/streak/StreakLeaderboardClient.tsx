"use client";

import { useState } from "react";
import styles from "../Lists.module.scss";
import { type StreakEntry } from "@/lib/actions/potd";

type StreakTab = "current" | "max";

type Props = {
  initialData: StreakEntry[];
};

export default function StreakLeaderboardClient({ initialData }: Props) {
  const [sortParam, setSortParam] = useState<StreakTab>("current");

  const sortedData = [...initialData].sort((a, b) => {
    const valA = sortParam === "current" ? a.currentStreak : a.longestStreak;
    const valB = sortParam === "current" ? b.currentStreak : b.longestStreak;
    if (valB !== valA) return valB - valA;
    // Tiebreaker: total POTD points DESC
    return b.totalPoints - a.totalPoints;
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerFlex}>
          <div>
            <h1>Streak Leaderboard</h1>
            <p>Rankings based on consecutive days of solving the POTD.</p>
          </div>
          <div className={styles.sortControls}>
            <label htmlFor="streakSort" className={styles.sortLabel}>
              Sort By:
            </label>
            <select
              id="streakSort"
              className={styles.sortSelect}
              value={sortParam}
              onChange={(e) => setSortParam(e.target.value as StreakTab)}
            >
              <option value="current">Current Streak</option>
              <option value="max">Max Streak All Time</option>
            </select>
          </div>
        </div>
      </div>

      {sortedData.length === 0 ? (
        <p style={{ color: "#666", padding: "2rem 0" }}>
          No streak data yet — start solving!
        </p>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Member</th>
                <th
                  className={
                    sortParam === "current"
                      ? styles.activeSortHeader
                      : styles.sortHeader
                  }
                  onClick={() => setSortParam("current")}
                >
                  Current Streak {sortParam === "current" && "▼"}
                </th>
                <th
                  className={
                    sortParam === "max"
                      ? styles.activeSortHeader
                      : styles.sortHeader
                  }
                  onClick={() => setSortParam("max")}
                >
                  Max Streak {sortParam === "max" && "▼"}
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Dense ranking: same rank if tied on both the active sort key AND totalPoints
                const ranks: number[] = [];
                sortedData.forEach((user, i) => {
                  if (i === 0) { ranks.push(1); return; }
                  const prev = sortedData[i - 1];
                  const prevVal = sortParam === "current" ? prev.currentStreak : prev.longestStreak;
                  const currVal = sortParam === "current" ? user.currentStreak : user.longestStreak;
                  const tied = prevVal === currVal && prev.totalPoints === user.totalPoints;
                  ranks.push(tied ? ranks[i - 1] : i + 1);
                });
                return sortedData.map((user, index) => {
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
                        {rank}
                      </span>
                    </td>
                    <td>
                      <div className={styles.userInfo}>
                        <span className={styles.userName}>{user.name}</span>
                        {user.codeforcesId && (
                          <span className={styles.userHandle}>
                            @{user.codeforcesId}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {user.currentStreak > 0 ? (
                        <span className={styles.streak}>
                          🔥 {user.currentStreak}
                        </span>
                      ) : (
                        <span className={styles.subText}>-</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.maxStreakWrapper}>
                        <span className={styles.maxStreakIcon}>⚡</span>{" "}
                        {user.longestStreak}
                      </span>
                    </td>
                  </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
