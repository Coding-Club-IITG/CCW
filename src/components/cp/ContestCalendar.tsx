"use client";

import { CONTEST_PLATFORM_DISPLAY_NAMES } from "@/lib/constants";
import type { ContestPlatform } from "@/lib/constants";
import type { ContestEntry } from "./CPPageClient";
import styles from "./ContestCalendar.module.scss";

type Props = {
  contests: ContestEntry[];
};

const PLATFORM_STYLE_KEYS: Record<ContestPlatform, string> = {
  codeforces: "cf",
  atcoder: "ac",
  codechef: "cc",
  leetcode: "lc",
};

function getNext7Days(baseDate: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setHours(0, 0, 0, 0);
    d.setDate(baseDate.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Timeline spans 00:00 to 24:00
const HOUR_START = 0;
const HOUR_END = 24;
const TOTAL_HOURS = HOUR_END - HOUR_START;

// Hours to display as labels (every 3 hours)
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];

function getBarPosition(contest: ContestEntry, dayStart: Date) {
  const start = new Date(contest.startTime);
  const end = new Date(contest.endTime);

  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

  // Clamp to the day boundaries
  const barStartMs = Math.max(start.getTime(), dayStartMs);
  const barEndMs = Math.min(end.getTime(), dayEndMs);

  const topPercent =
    ((barStartMs - dayStartMs) / (TOTAL_HOURS * 60 * 60 * 1000)) * 100;
  const heightPercent =
    ((barEndMs - barStartMs) / (TOTAL_HOURS * 60 * 60 * 1000)) * 100;

  return {
    top: `${topPercent}%`,
    height: `${Math.max(heightPercent, 2.5)}%`, // minimum visible height
  };
}

export default function ContestCalendar({ contests }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = getNext7Days(today);

  // Group contests by day within the next 7 days
  const contestsByDay: Map<number, ContestEntry[]> = new Map();
  for (let i = 0; i < 7; i++) {
    contestsByDay.set(i, []);
  }

  contests.forEach((contest) => {
    const start = new Date(contest.startTime);
    const end = new Date(contest.endTime);
    for (let i = 0; i < 7; i++) {
      const dayStart = days[i];
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      // Contest overlaps this day if it starts before day end and ends after day start
      if (start < dayEnd && end > dayStart) {
        contestsByDay.get(i)!.push(contest);
      }
    }
  });

  // Collect contests beyond the next 7 days
  const rangeEnd = new Date(days[6]);
  rangeEnd.setHours(23, 59, 59, 999);
  const upcomingBeyondRange = contests.filter(
    (c) => new Date(c.startTime) > rangeEnd,
  );

  return (
    <div className={styles.calendar}>
      <h2 className={styles.title}>Upcoming Contests</h2>

      <div className={styles.timeline}>
        {/* Time axis */}
        <div className={styles.timeAxis}>
          <div className={styles.timeAxisHeader} />
          <div className={styles.timeAxisBody}>
            {HOUR_LABELS.map((hour) => (
              <div
                key={hour}
                className={styles.timeLabel}
                style={{
                  top: `${((hour - HOUR_START) / TOTAL_HOURS) * 100}%`,
                }}
              >
                {hour === 0
                  ? "12 AM"
                  : hour < 12
                    ? `${hour} AM`
                    : hour === 12
                      ? "12 PM"
                      : `${hour - 12} PM`}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        {days.map((date, i) => {
          const dayContests = contestsByDay.get(i) || [];
          const isToday = i === 0;

          return (
            <div
              key={i}
              className={`${styles.dayColumn} ${isToday ? styles.today : ""}`}
            >
              <div className={styles.dayHeader}>
                <span className={styles.dayName}>
                  {DAY_NAMES[date.getDay()]}
                </span>
                <span className={styles.dayDate}>
                  {MONTH_NAMES[date.getMonth()]} {date.getDate()}
                </span>
              </div>
              <div className={styles.dayBody}>
                {/* Hour gridlines */}
                {HOUR_LABELS.map((hour) => (
                  <div
                    key={hour}
                    className={styles.hourLine}
                    style={{
                      top: `${((hour - HOUR_START) / TOTAL_HOURS) * 100}%`,
                    }}
                  />
                ))}

                {/* Contest bars */}
                {dayContests.map((contest) => {
                  const pos = getBarPosition(contest, date);
                  const platformKey =
                    PLATFORM_STYLE_KEYS[contest.platform as ContestPlatform] ||
                    "";

                  return (
                    <a
                      key={contest.id}
                      href={contest.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.contestBar} ${styles[platformKey]}`}
                      style={{ top: pos.top, height: pos.height }}
                      title={`${contest.name}\n${formatTime(new Date(contest.startTime))} – ${formatTime(new Date(contest.endTime))}\n${formatDuration(contest.durationSeconds)}`}
                    >
                      <span className={styles.barPlatform}>
                        {CONTEST_PLATFORM_DISPLAY_NAMES[
                          contest.platform as ContestPlatform
                        ] || contest.platform}
                      </span>
                      <span className={styles.barName}>{contest.name}</span>
                      <span className={styles.barTime}>
                        {formatTime(new Date(contest.startTime))}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {upcomingBeyondRange.length > 0 && (
        <div className={styles.upcomingSection}>
          <h3 className={styles.upcomingTitle}>Later</h3>
          <div className={styles.upcomingList}>
            {upcomingBeyondRange.slice(0, 20).map((contest) => (
              <a
                key={contest.id}
                href={contest.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${styles.upcomingItem} ${styles[PLATFORM_STYLE_KEYS[contest.platform as ContestPlatform] || ""]}`}
              >
                <span className={styles.barPlatform}>
                  {CONTEST_PLATFORM_DISPLAY_NAMES[
                    contest.platform as ContestPlatform
                  ] || contest.platform}
                </span>
                <span className={styles.barName}>{contest.name}</span>
                <span className={styles.barTime}>
                  {new Date(contest.startTime).toLocaleDateString()} at{" "}
                  {formatTime(new Date(contest.startTime))} •{" "}
                  {formatDuration(contest.durationSeconds)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {contests.length === 0 && (
        <p className={styles.empty}>
          No upcoming contests found. Data syncs every 3 hours.
        </p>
      )}
    </div>
  );
}
