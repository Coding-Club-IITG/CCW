"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import styles from "./Potd.module.scss";
import {
  syncMySubmission,
  type TodayChallengeData,
  type ChallengeEntry,
} from "@/lib/actions/potd";
import {
  IconCheckCircle,
  IconInfoCircle,
  IconStar,
} from "@/components/shared/Icons";
import {
  DIFFICULTY_COLORS,
  IST_OFFSET_MS,
  PLATFORM_DISPLAY_NAMES,
  PLATFORM_PROBLEM_URLS,
} from "@/lib/constants";

type Props = {
  cfVerified: boolean;
  acVerified: boolean;
  initialData: TodayChallengeData | null;
};

export default function DailyChallengeClient({
  cfVerified,
  acVerified,
  initialData,
}: Props) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [hoursLeft, setHoursLeft] = useState<number>(0);
  const [isClient, setIsClient] = useState(false);
  const [data, setData] = useState(initialData);

  const [showPointsInfo, setShowPointsInfo] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPointsInfo) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setShowPointsInfo(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPointsInfo]);

  // Per-challenge sync state
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});

  // Countdown to windowEnd / graceEnd (shared across all challenges for the day)
  // If the user keeps the page open past windowEnd, timer seamlessly extends
  // to show the remaining grace window time.
  useEffect(() => {
    setIsClient(true);

    const getDeadline = () => {
      if (data) {
        const windowEnd = new Date(data.windowEnd);
        const graceEnd = new Date(data.graceEnd);
        const now = new Date();
        if (now <= windowEnd) return windowEnd;
        if (now <= graceEnd) return graceEnd;
        return graceEnd;
      }
      // Fallback: EOD IST
      const istDate = new Date(Date.now() + IST_OFFSET_MS);
      return new Date(
        Date.UTC(
          istDate.getUTCFullYear(),
          istDate.getUTCMonth(),
          istDate.getUTCDate(),
          18,
          29,
          59,
        ),
      );
    };

    const calculateTimeLeft = () => {
      const target = getDeadline();
      const diff = Math.max(0, target.getTime() - Date.now());
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setHoursLeft(diff / (1000 * 60 * 60));
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, [data]);

  // Per-challenge cooldown timers
  useEffect(() => {
    const intervals: NodeJS.Timeout[] = [];
    Object.entries(cooldowns).forEach(([id, left]) => {
      if (left > 0) {
        const t = setInterval(() => {
          setCooldowns((prev) => {
            const next = { ...prev, [id]: Math.max(0, (prev[id] ?? 0) - 1) };
            return next;
          });
        }, 1000);
        intervals.push(t);
      }
    });
    return () => intervals.forEach(clearInterval);
  }, [cooldowns]);

  const handleSync = async (challengeId: string) => {
    setSyncing((p) => ({ ...p, [challengeId]: true }));
    setSyncErrors((p) => ({ ...p, [challengeId]: "" }));

    try {
      const result = await syncMySubmission(challengeId);
      setCooldowns((p) => ({ ...p, [challengeId]: 60 }));

      if (result.ok) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            challenges: prev.challenges.map((c) =>
              c.challengeId === challengeId
                ? {
                    ...c,
                    mySubmission: {
                      status: result.status as any,
                      solvedAt: null,
                      pointsAwarded: result.pointsAwarded ?? 0,
                    },
                  }
                : c,
            ),
          };
        });

        if (result.status === "Accepted") {
          alert(`Sync complete! You earned ${result.pointsAwarded} pts.`);
        } else if (result.status === "Late") {
          alert(
            `Sync complete! Grace window solve - ${result.pointsAwarded} pts earned (50% penalty applied, streak saved).`,
          );
        } else if (result.status === "Pending") {
          alert("No accepted submission found yet. Try again later.");
        } else if (result.status === "NotSolved") {
          alert("The window has closed and no solve was detected.");
        }
      } else {
        setSyncErrors((p) => ({
          ...p,
          [challengeId]: result.error ?? "Sync failed",
        }));
      }
    } catch {
      setSyncErrors((p) => ({
        ...p,
        [challengeId]: "An unexpected error occurred",
      }));
    } finally {
      setSyncing((p) => ({ ...p, [challengeId]: false }));
    }
  };

  const isInGrace =
    data &&
    isClient &&
    new Date() > new Date(data.windowEnd) &&
    new Date() <= new Date(data.graceEnd);

  if (!data || data.challenges.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p className={styles.noChallenge}>
            No challenge scheduled for today. Check back later!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Shared timer card */}
      <div className={styles.card}>
        <div className={styles.statsRow}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.label}>
                {isInGrace ? "Grace Window Ends" : "Window Closes"}
              </span>
              <span
                className={`${styles.value} ${styles.timerValue}`}
                style={{
                  color: !isClient
                    ? "inherit"
                    : hoursLeft > 10
                      ? "var(--success)"
                      : hoursLeft < 2
                        ? "var(--danger)"
                        : "var(--warning)",
                }}
              >
                {isClient ? timeLeft : "00:00:00"}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.label}>Today&apos;s Problems</span>
              <span className={styles.value}>{data.challenges.length}</span>
            </div>
          </div>
          <div className={styles.infoTriggerWrapper} ref={popoverRef}>
            <button
              className={styles.infoTrigger}
              onClick={() => setShowPointsInfo(!showPointsInfo)}
              aria-label="Points calculation info"
              type="button"
            >
              <IconInfoCircle width="20" height="20" />
            </button>
            {showPointsInfo && (
              <div className={styles.infoPopover}>
                <div className={styles.infoPopoverHeader}>
                  <IconStar width="14" height="14" />
                  Points Calculation
                </div>
                <div className={styles.infoPopoverGrid}>
                  <div className={styles.infoPopoverItem}>
                    <span>Base Points</span>
                    <span>Problem Rating ÷ 10</span>
                  </div>
                  <div className={styles.infoPopoverItem}>
                    <span>Streak Bonus</span>
                    <span>+5% per day (max +50% at 10-day streak)</span>
                  </div>
                  <div className={styles.infoPopoverItem}>
                    <span>Grace Penalty</span>
                    <span>50% of base, no streak bonus (streak preserved)</span>
                  </div>
                </div>
                <div className={styles.infoPopoverNote}>
                  <IconInfoCircle width="12" height="12" />
                  <span>
                    Solves after midnight IST enter a 2-hour grace window (until
                    2:00 AM). Grace solves earn half points and preserve your
                    streak. Submissions are tracked automatically.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Problem Cards */}
      {data.challenges.map((entry) => (
        <ProblemCard
          key={entry.challengeId}
          entry={entry}
          cfVerified={cfVerified}
          acVerified={acVerified}
          isSyncing={!!syncing[entry.challengeId]}
          cooldown={cooldowns[entry.challengeId] ?? 0}
          syncError={syncErrors[entry.challengeId] ?? null}
          onSync={() => handleSync(entry.challengeId)}
        />
      ))}
    </div>
  );
}

// Problem card

function ProblemCard({
  entry,
  cfVerified,
  acVerified,
  isSyncing,
  cooldown,
  syncError,
  onSync,
}: {
  entry: ChallengeEntry;
  cfVerified: boolean;
  acVerified: boolean;
  isSyncing: boolean;
  cooldown: number;
  syncError: string | null;
  onSync: () => void;
}) {
  const { problem, mySubmission, difficulty, platform } = entry;
  const myStatus = mySubmission?.status ?? "none";
  const alreadySolved = myStatus === "Accepted" || myStatus === "Late";

  const isVerified = platform === "codeforces" ? cfVerified : acVerified;
  const problemUrl = PLATFORM_PROBLEM_URLS[platform](
    problem.contestId,
    problem.problemIndex,
  );
  const platformName = PLATFORM_DISPLAY_NAMES[platform];

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.problemHeaderRow}>
            <span className={styles.problemId}>
              {platformName} {problem.contestId}-{problem.problemIndex}
            </span>
            <span
              className={styles.difficultyBadge}
              style={{
                color: DIFFICULTY_COLORS[difficulty],
                borderColor: DIFFICULTY_COLORS[difficulty],
              }}
            >
              {difficulty}
            </span>
          </div>
          <h2 className={styles.title}>{problem.name}</h2>
        </div>
        <div className={styles.rating}>{problem.rating || "Unrated"}</div>
      </div>

      <div className={styles.statsWithBorder}>
        <div className={styles.stat}>
          <span className={styles.label}>Your Status</span>
          <span className={styles.value}>
            {myStatus === "Accepted" ? (
              <>
                <IconCheckCircle
                  width="20"
                  height="20"
                  style={{ marginRight: "8px", color: "#10b981" }}
                />
                Solved ({mySubmission.pointsAwarded} pts)
              </>
            ) : myStatus === "Late" ? (
              <>
                <IconCheckCircle
                  width="20"
                  height="20"
                  style={{ marginRight: "8px", color: "#f59e0b" }}
                />
                Grace solve ({mySubmission.pointsAwarded} pts)
              </>
            ) : myStatus === "Pending" ? (
              "Not synced yet"
            ) : myStatus === "NotSolved" ? (
              "Not solved"
            ) : (
              "-"
            )}
          </span>
        </div>
      </div>

      {syncError && <p className={styles.syncError}>{syncError}</p>}

      <div className={styles.actionArea}>
        {isVerified ? (
          <>
            <Link
              href={`/internal/solve?platform=${platform}&contestId=${problem.contestId}&problemIndex=${problem.problemIndex}&title=${encodeURIComponent(problem.name)}&challengeId=${entry.challengeId}`}
              className={`${styles.syncBtn} ${styles.solveLink}`}
            >
              Solve
            </Link>
            <a
              href={problemUrl}
              target="_blank"
              rel="noreferrer"
              className={`${styles.syncBtn} ${styles.openProblemLink}`}
            >
              Open Problem
            </a>
            {!alreadySolved && (
              <button
                className={`${styles.syncBtn} ${cooldown > 0 ? styles.syncDisabled : ""}`}
                onClick={onSync}
                disabled={isSyncing || cooldown > 0}
              >
                {isSyncing
                  ? "Syncing..."
                  : cooldown > 0
                    ? `Wait ${cooldown}s`
                    : "Sync My Answer"}
              </button>
            )}
          </>
        ) : (
          <div className={styles.verifyPrompt}>
            <p>
              Your {platformName} ID is unverified. Please verify it to
              participate.
            </p>
            <Link href="/internal/profile" className={styles.verifyBtn}>
              Verify ID
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
