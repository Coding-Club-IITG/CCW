"use client";

import { useState } from "react";
import Link from "next/link";

import { ContestListingItem } from "@/lib/actions/contests";
import BackLink from "@/components/shared/BackLink";
import styles from "./MatchHistoryClient.module.scss";

export default function MatchHistoryClient({
  history,
}: {
  history: ContestListingItem[];
}) {
  const [formatFilter, setFormatFilter] = useState("Format: All");
  const [outcomeFilter, setOutcomeFilter] = useState("Outcome: All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredHistory = history.filter((contest) => {
    // format filter
    if (formatFilter !== "Format: All") {
      const modeLower = (contest.mode || contest.format).toLowerCase();
      if (formatFilter.toLowerCase() !== modeLower) return false;
    }

    // outcome filter
    if (outcomeFilter !== "Outcome: All") {
      const result = contest.result;
      if (outcomeFilter === "Victory" && result !== "victory") return false;
      if (outcomeFilter === "Defeat" && result !== "loss") return false;
      if (outcomeFilter === "Tie" && result !== "tie") return false;
    }

    // date filter
    if (startDate) {
      if (!contest.startTime) return false;
      const [y, m, d] = startDate.split("-");
      const startOfDay = new Date(
        parseInt(y),
        parseInt(m) - 1,
        parseInt(d),
        0,
        0,
        0,
        0,
      );
      if (new Date(contest.startTime).getTime() < startOfDay.getTime())
        return false;
    }
    if (endDate) {
      if (!contest.startTime) return false;
      const [y, m, d] = endDate.split("-");
      const endOfDay = new Date(
        parseInt(y),
        parseInt(m) - 1,
        parseInt(d),
        23,
        59,
        59,
        999,
      );
      if (new Date(contest.startTime).getTime() > endOfDay.getTime())
        return false;
    }

    return true;
  });

  filteredHistory.sort((a, b) => {
    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
    return timeB - timeA;
  });

  return (
    <div className={styles.page}>
      <div className={styles.bgPattern} aria-hidden="true"></div>

      <main className={styles.main}>
        {/* Breadcrumb */}
        <BackLink href="/internal/contests" label="Back to Contests" />

        {/* Page Header */}
        <header className={styles.header}>
          <h1>Match History</h1>
          <p>Review your recent algorithmic battles and performance metrics.</p>
        </header>

        {/* Top Control Bar */}
        <div className={styles.controlBar}>
          {/* Filters */}
          <div className={styles.filters}>
            {/* Format Filter */}
            <div className={styles.selectWrap}>
              <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                className={styles.select}
              >
                <option>Format: All</option>
                <option>Blitz</option>
                <option>Arena</option>
              </select>
              <span
                className={`material-symbols-outlined ${styles.selectIcon}`}
              >
                expand_more
              </span>
            </div>
            {/* Outcome Filter */}
            <div className={styles.selectWrap}>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className={styles.select}
              >
                <option>Outcome: All</option>
                <option>Victory</option>
                <option>Tie</option>
                <option>Defeat</option>
              </select>
              <span
                className={`material-symbols-outlined ${styles.selectIcon}`}
              >
                expand_more
              </span>
            </div>
            {/* Date Filter */}
            <div className={styles.dateGroup}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={styles.dateInput}
              />
              <span className={styles.dateSep}>-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={styles.dateInput}
              />
            </div>
          </div>
        </div>

        {/* Match History List */}
        <div className={styles.list}>
          {filteredHistory.map((contest) => {
            const result = contest.result;
            const isVictory = result === "victory";
            const isTie = result === "tie";
            const outcomeScore = contest.userScore ?? 0;
            const otherScores =
              contest.otherScores && contest.otherScores.length > 0
                ? contest.otherScores
                : [contest.opponentScore ?? 0];

            const stateClass = isVictory
              ? styles.victory
              : isTie
                ? styles.tie
                : styles.defeat;

            return (
              <div
                key={contest._id}
                className={`${styles.matchCard} ${stateClass}`}
              >
                {/* Left: Info */}
                <div className={styles.info}>
                  <div className={styles.badgeRow}>
                    {isVictory ? (
                      <span className={styles.badgeVictory}>VICTORY</span>
                    ) : isTie ? (
                      <span className={styles.badgeTie}>TIE</span>
                    ) : (
                      <span className={styles.badgeDefeat}>DEFEAT</span>
                    )}

                    <span className={styles.badgeNeutral}>
                      {contest.mode || contest.format}
                    </span>

                    {/* Tournament Tag */}
                    {contest.format === "bracket" && (
                      <div className={styles.tournamentTag}>
                        <span
                          className={`material-symbols-outlined ${styles.iconXs}`}
                        >
                          emoji_events
                        </span>
                        {contest.name}
                      </div>
                    )}
                  </div>

                  <div className={styles.meta}>
                    <span
                      className={`material-symbols-outlined ${styles.metaIcon}`}
                    >
                      calendar_today
                    </span>
                    <span className={styles.metaText}>
                      {contest.startTime
                        ? new Intl.DateTimeFormat("en-US", {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          }).format(new Date(contest.startTime))
                        : "-"}
                    </span>
                    <span className={styles.metaDot}></span>
                    <span
                      className={`material-symbols-outlined ${styles.metaIcon}`}
                    >
                      timer
                    </span>
                    <span className={styles.metaText}>
                      {contest.startTime && contest.endTime
                        ? (() => {
                            const diffMs =
                              new Date(contest.endTime).getTime() -
                              new Date(contest.startTime).getTime();
                            if (diffMs > 0) {
                              const totalSeconds = Math.floor(diffMs / 1000);
                              const minutes = Math.floor(totalSeconds / 60);
                              const seconds = totalSeconds % 60;
                              return `${minutes}m ${seconds}s`;
                            }
                            return "0m 0s";
                          })()
                        : `${Math.floor((contest.durationSeconds || 3600) / 60)}m`}
                    </span>
                  </div>
                </div>

                {/* Middle: Score */}
                <div className={styles.score}>
                  <div className={styles.scoreInner}>
                    <span
                      className={`${styles.scoreValue} ${
                        isVictory
                          ? styles.scoreVictory
                          : isTie
                            ? styles.scoreTie
                            : ""
                      }`}
                    >
                      {outcomeScore}
                    </span>
                    {otherScores.map((score, idx) => (
                      <div key={idx} className={styles.scoreInner}>
                        <span className={styles.scoreDash}>-</span>
                        <span
                          className={`${styles.scoreValue} ${
                            !isVictory && !isTie && score > outcomeScore
                              ? styles.scoreLead
                              : ""
                          }`}
                        >
                          {score}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: CTA */}
                <div className={styles.cta}>
                  <Link href={`/internal/contests/${contest._id}?from=history`}>
                    <button className={styles.resultsBtn}>
                      Results
                      <span
                        className={`material-symbols-outlined ${styles.iconSm}`}
                      >
                        arrow_forward
                      </span>
                    </button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
