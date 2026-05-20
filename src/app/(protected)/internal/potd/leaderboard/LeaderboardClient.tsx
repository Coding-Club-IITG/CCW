"use client";

import { useState } from "react";
import styles from "../Lists.module.scss";
import { type LeaderboardEntry } from "@/lib/actions/potd";

type Tab = "weekly" | "monthly";

type Props = {
  initialWeekly: LeaderboardEntry[];
  initialMonthly: LeaderboardEntry[];
};

export default function LeaderboardClient({
  initialWeekly,
  initialMonthly,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("weekly");

  const data = activeTab === "weekly" ? initialWeekly : initialMonthly;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>POTD Leaderboard</h1>
        <p>Rankings based on Problem of the Day performance.</p>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "weekly" ? styles.active : ""}`}
          onClick={() => setActiveTab("weekly")}
        >
          Past 1 Week
        </button>
        <button
          className={`${styles.tab} ${activeTab === "monthly" ? styles.active : ""}`}
          onClick={() => setActiveTab("monthly")}
        >
          Past 1 Month
        </button>
      </div>

      <div className={styles.tableContainer}>
        {data.length === 0 ? (
          <p style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
            No data yet — start solving!
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Member</th>
                <th>Points</th>
                <th>Current Streak</th>
                <th>Solved</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Dense ranking: same rank if tied on both points AND streak
                const ranks: number[] = [];
                data.forEach((user, i) => {
                  if (i === 0) { ranks.push(1); return; }
                  const prev = data[i - 1];
                  const tied = prev.totalPoints === user.totalPoints &&
                    prev.currentStreak === user.currentStreak;
                  ranks.push(tied ? ranks[i - 1] : i + 1);
                });
                return data.map((user, index) => {
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
                        <span className={styles.points}>
                          {user.totalPoints.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        {user.currentStreak > 0 ? (
                          <span className={styles.streak}>
                            🔥 {user.currentStreak}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className={styles.subText}>{user.totalSolved}</td>
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
