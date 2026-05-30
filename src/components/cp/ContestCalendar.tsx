"use client";

import { useState, useEffect, useRef } from "react";
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

function get7Days(baseDate: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setHours(0, 0, 0, 0);
    d.setDate(baseDate.getDate() + i);
    dates.push(d);
  }
  return dates;
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
    height: `${Math.max(heightPercent, 2.5)}%`,
  };
}

// Compute side-by-side layout for overlapping contests
function computeOverlapColumns(dayContests: ContestEntry[], dayStart: Date) {
  if (dayContests.length === 0) return [];

  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

  // Get clamped start/end times for each contest in this day
  const items = dayContests.map((contest) => {
    const start = Math.max(new Date(contest.startTime).getTime(), dayStartMs);
    const end = Math.min(new Date(contest.endTime).getTime(), dayEndMs);
    return { contest, start, end, col: 0, totalCols: 1 };
  });

  // Sort by start time
  items.sort((a, b) => a.start - b.start);

  // Assign columns using a greedy algorithm
  const columns: { end: number }[][] = [];

  for (const item of items) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      // Check if this column is free (no overlap with existing items)
      const lastInCol = columns[col][columns[col].length - 1];
      if (lastInCol.end <= item.start) {
        columns[col].push({ end: item.end });
        item.col = col;
        placed = true;
        break;
      }
    }
    if (!placed) {
      item.col = columns.length;
      columns.push([{ end: item.end }]);
    }
  }

  // Determine total columns for each overlapping group
  const totalCols = columns.length;
  for (const item of items) {
    item.totalCols = totalCols;
  }

  return items;
}

function getCurrentTimePercent(): number {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return ((hours * 60 + minutes) / (TOTAL_HOURS * 60)) * 100;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type PopoverState = {
  contest: ContestEntry;
  x: number;
  y: number;
} | null;

export default function ContestCalendar({ contests }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [weekOffset, setWeekOffset] = useState(0);
  const [timePercent, setTimePercent] = useState(getCurrentTimePercent);
  const [popover, setPopover] = useState<PopoverState>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const weekStart = new Date(today);
  // Always start on Sunday
  weekStart.setDate(today.getDate() - today.getDay() + weekOffset * 7);
  const days = get7Days(weekStart);

  // Check if today falls within the current displayed week
  const showTimeLine = days.some((d) => isSameDay(d, today));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimePercent(getCurrentTimePercent());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Group contests by day
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

  function handleBarMouseEnter(
    e: React.MouseEvent<HTMLAnchorElement>,
    contest: ContestEntry,
  ) {
    const rect = calendarRef.current?.getBoundingClientRect();
    const barRect = e.currentTarget.getBoundingClientRect();
    if (!rect) return;

    setPopover({
      contest,
      x: barRect.left - rect.left + barRect.width / 2,
      y: barRect.top - rect.top,
    });
  }

  function handleBarMouseLeave() {
    setPopover(null);
  }

  return (
    <div className={styles.calendar} ref={calendarRef}>
      <div className={styles.header}>
        <h2 className={styles.title}>Contest Schedule</h2>
        <div className={styles.weekNav}>
          <button
            className={styles.navBtn}
            onClick={() => setWeekOffset((o) => o - 1)}
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            className={styles.todayBtn}
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
          >
            Today
          </button>
          <button
            className={styles.navBtn}
            onClick={() => setWeekOffset((o) => o + 1)}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

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
          const isToday = isSameDay(date, today);

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

                {/* Current time indicator */}
                {isToday && showTimeLine && (
                  <div
                    className={styles.currentTimeLine}
                    style={{ top: `${timePercent}%` }}
                  />
                )}

                {/* Contest bars */}
                {computeOverlapColumns(dayContests, date).map(
                  ({ contest, col, totalCols }) => {
                    const pos = getBarPosition(contest, date);
                    const platformKey =
                      PLATFORM_STYLE_KEYS[
                        contest.platform as ContestPlatform
                      ] || "";
                    const widthPercent = 100 / totalCols;
                    const leftPercent = col * widthPercent;

                    return (
                      <a
                        key={contest.id}
                        href={contest.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${styles.contestBar} ${styles[platformKey]}`}
                        style={{
                          top: pos.top,
                          height: pos.height,
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                        }}
                        onMouseEnter={(e) => handleBarMouseEnter(e, contest)}
                        onMouseLeave={handleBarMouseLeave}
                      >
                        <span className={styles.barPlatform}>
                          {CONTEST_PLATFORM_DISPLAY_NAMES[
                            contest.platform as ContestPlatform
                          ] || contest.platform}
                        </span>
                        <span className={styles.barTime}>
                          {formatTime(new Date(contest.startTime))}
                        </span>
                      </a>
                    );
                  },
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hover popover */}
      {popover && (
        <div
          ref={popoverRef}
          className={styles.popover}
          style={{
            left: `${popover.x}px`,
            top: `${popover.y}px`,
          }}
        >
          <div className={styles.popoverArrow} />
          <div
            className={`${styles.popoverPlatform} ${styles[PLATFORM_STYLE_KEYS[popover.contest.platform as ContestPlatform] || ""]}`}
          >
            {CONTEST_PLATFORM_DISPLAY_NAMES[
              popover.contest.platform as ContestPlatform
            ] || popover.contest.platform}
          </div>
          <div className={styles.popoverName}>{popover.contest.name}</div>
          <div className={styles.popoverMeta}>
            <span>
              {formatTime(new Date(popover.contest.startTime))} –{" "}
              {formatTime(new Date(popover.contest.endTime))}
            </span>
            <span className={styles.popoverDot}>•</span>
            <span>{formatDuration(popover.contest.durationSeconds)}</span>
          </div>
          <div className={styles.popoverDate}>
            {new Date(popover.contest.startTime).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
      )}

      {contests.length === 0 && (
        <p className={styles.empty}>
          No contests found. Data syncs every 3 hours.
        </p>
      )}
    </div>
  );
}
