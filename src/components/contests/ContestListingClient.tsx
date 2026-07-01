"use client";

import { useState } from "react";
import type { ContestListingItem } from "@/lib/actions/contests";
import Link from "next/link";
import { Calendar, Users, Timer, CheckCircle, Filter, CalendarOff } from "lucide-react";
import styles from "./ContestListing.module.scss";

type FormatFilter = "all" | "blitz" | "arena" | "bracket";

export default function ContestListingClient({
  initialActive,
  initialUpcoming,
  initialCompleted,
}: {
  initialActive: ContestListingItem[];
  initialUpcoming: ContestListingItem[];
  initialCompleted: ContestListingItem[];
}) {
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");

  const filterByFormat = (item: ContestListingItem) => {
    if (formatFilter === "all") return true;
    if (formatFilter === "blitz") return item.mode === "blitz";
    if (formatFilter === "bracket") return item.format === "bracket";
    if (formatFilter === "arena") return item.mode === "arena" && item.format !== "bracket";
    return false;
  };

  const active = initialActive.filter(filterByFormat);
  const upcoming = initialUpcoming.filter(filterByFormat);
  const completed = initialCompleted.filter(filterByFormat);

  return (
    <div className={styles.container}>
      {/* Header & Filters */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Contests</h1>
        </div>
        <div className={styles.filterGroup}>
          <button
            onClick={() => setFormatFilter("all")}
            className={`${styles.filterBtn} ${formatFilter === "all" ? styles.active : ""}`}
          >
            <Filter size={16} />
            All Formats
          </button>
          <button
            onClick={() => setFormatFilter("blitz")}
            className={`${styles.filterBtn} ${formatFilter === "blitz" ? styles.active : ""}`}
          >
            Blitz
          </button>
          <button
            onClick={() => setFormatFilter("arena")}
            className={`${styles.filterBtn} ${formatFilter === "arena" ? styles.active : ""}`}
          >
            Arena
          </button>
          <button
            onClick={() => setFormatFilter("bracket")}
            className={`${styles.filterBtn} ${formatFilter === "bracket" ? styles.active : ""}`}
          >
            Knockout
          </button>
        </div>
      </div>

      {/* Active Contests */}
      {active.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.pulseDot}></div>
            <h2 className={styles.sectionTitle}>Active Now</h2>
          </div>
          <div className={styles.grid2}>
            {active.map((contest) => (
              <div key={contest._id} className={`${styles.card} ${styles.cardActive}`}>
                <div className={styles.cardHeader}>
                  <div>
                    <span className={`${styles.badge} ${styles.badgeActive}`}>
                      {contest.format === "bracket" ? "Knockout" : contest.mode} Format
                    </span>
                  </div>
                </div>
                
                <h3 className={styles.cardTitle}>{contest.name}</h3>
                <p className={styles.cardDesc}>{contest.description || "Active contest"}</p>
                
                <div className={styles.stats}>
                  <div className={styles.statItem}>
                    <Users size={16} /> {contest.registeredCount} Registered
                  </div>
                  {contest.durationSeconds && (
                    <div className={styles.statItem}>
                      <Timer size={16} /> {Math.round(contest.durationSeconds / 60)} mins
                    </div>
                  )}
                </div>

                <div className={`${styles.cardFooter} ${styles.cardFooterActive}`}>
                  {contest.isRegistered ? (
                    <div className={styles.registeredStatus}>
                      <CheckCircle size={18} />
                      Registered
                    </div>
                  ) : (
                    <div></div>
                  )}
                  <Link href={`/internal/contests/${contest._id}`}>
                    <button className={styles.btnPrimary}>
                      {contest.isRegistered ? "Join room" : "View"}
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Contests */}
      {upcoming.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitleBorder}>Upcoming</h2>
          <div className={styles.grid3}>
            {upcoming.map((contest) => (
              <div key={contest._id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={styles.badge}>
                    {contest.format === "bracket" ? "Knockout" : contest.mode} Format
                  </span>
                  {contest.startTime && (
                    <span className={styles.timeTag}>
                      {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(contest.startTime))}
                    </span>
                  )}
                </div>
                
                <h3 className={styles.cardTitle}>{contest.name}</h3>
                <p className={styles.cardDesc}>{contest.description || "Upcoming contest"}</p>
                
                <div className={styles.cardFooter}>
                  {contest.isRegistered ? (
                    <div className={styles.registeredStatus}>
                      <CheckCircle size={18} />
                      Registered
                    </div>
                  ) : (
                    <span className={styles.statItem} style={{ color: "var(--foreground-secondary)", fontSize: "0.875rem" }}>
                      {contest.registeredCount} Registered
                    </span>
                  )}
                  <Link href={`/internal/contests/${contest._id}`}>
                    <button className={contest.isRegistered ? styles.btnOutline : styles.btnOutlinePrimary}>
                      {contest.isRegistered ? "Details" : "Register"}
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Past Contests (List View) */}
      {completed.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitleBorder}>Completed</h2>
          <div className={styles.tableContainer}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Contest Name</th>
                    <th className={styles.th}>Date</th>
                    <th className={styles.th}>Format</th>
                    <th className={styles.th}>Participants</th>
                  </tr>
                </thead>
                <tbody>
                  {completed.map((contest) => (
                    <tr key={contest._id} className={styles.tr}>
                      <td className={`${styles.td} ${styles.tdStrong}`}>
                        <Link href={`/internal/contests/${contest._id}`} className={styles.linkFull}>
                          {contest.name}
                        </Link>
                      </td>
                      <td className={styles.td}>
                        {contest.startTime ? new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(contest.startTime)) : "-"}
                      </td>
                      <td className={styles.td}>
                        <span className={styles.badge}>
                          {contest.format === "bracket" ? "Knockout" : contest.mode}
                        </span>
                      </td>
                      <td className={styles.td}>{contest.registeredCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
      
      {active.length === 0 && upcoming.length === 0 && completed.length === 0 && (
         <div className={styles.emptyState}>
           <CalendarOff className={styles.emptyIcon} style={{ display: 'inline-block' }} />
           <h3>No contests found</h3>
           <p>There are no contests matching your selected format.</p>
         </div>
      )}
    </div>
  );
}
