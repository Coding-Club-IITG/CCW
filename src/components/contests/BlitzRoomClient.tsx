"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CircleAlert,
  CircleCheck,
  Code,
  ExternalLink,
  Gavel,
  Hourglass,
  Info,
  type LucideIcon,
  Play,
  RefreshCw,
  Rss,
  Sparkles,
  Target,
  Timer,
  Trophy,
  User,
  UserX,
  Users,
  X,
} from "lucide-react";
import { ContestListingItem } from "@/lib/actions/contests";

import { useEffect, useState, useRef, createElement } from "react";
import { useRouter } from "next/navigation";
import { getDisplayName } from "@/lib/utils";
import styles from "./BlitzRoomClient.module.scss";

const ACTIVITY_ICON_MAP: Record<string, LucideIcon> = {
  info: Info,
  gavel: Gavel,
  sync: RefreshCw,
  check_circle: CircleCheck,
  error: CircleAlert,
  person: User,
  person_off: UserX,
};

// SVG sources (matching Lucide icons) for browser desktop notifications
const NOTIFICATION_SVG_ICONS: Record<string, string> = {
  info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  gavel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 12.5-8 8a2.12 2.12 0 0 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>`,
  lock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  sync: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  check_circle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
  error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  person: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  person_off: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/></svg>`,
};

function sendBrowserNotification(icon: string, text: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const svgSource = NOTIFICATION_SVG_ICONS[icon] ?? NOTIFICATION_SVG_ICONS.info;
    const iconUri = `data:image/svg+xml,${encodeURIComponent(svgSource)}`;
    new Notification("CCW Match", { body: text, icon: iconUri, silent: true });
  } catch (_) {}
}

interface EventPayload {
  type: string;
  [key: string]: any;
}

export default function BlitzRoomClient({
  contest,
  roomId,
  roomName,
  teamId,
  userId,
  cfHandle,
  teams,
  initialReadyUserIds = [],
  initialOnlineUserIds = [],
  initialMatchState = "waiting",
  initialProblems = [],
  initialScores = {},
  initialProblemIndex = 0,
  initialStartTime,
  initialTimeLimit,
  from,
  syncCooldownSeconds = 60,
}: {
  contest: ContestListingItem;
  roomId: string;
  roomName: string;
  teamId: string;
  userId: string;
  cfHandle?: string;
  teams?: any[];
  initialReadyUserIds?: string[];
  initialOnlineUserIds?: string[];
  initialMatchState?: "waiting" | "active" | "completed";
  initialProblems?: any[];
  initialScores?: Record<string, number>;
  initialProblemIndex?: number;
  initialStartTime?: number;
  initialTimeLimit?: number;
  from?: string;
  syncCooldownSeconds?: number;
}) {
  const router = useRouter();

  const [matchState, setMatchState] = useState<
    "waiting" | "active" | "completed"
  >(initialMatchState);
  const matchStateRef = useRef(initialMatchState);
  const [showMatchStartedModal, setShowMatchStartedModal] = useState(false);
  const [problems, setProblems] = useState<any[]>(initialProblems);
  const [currentProblemIndex, setCurrentProblemIndex] =
    useState(initialProblemIndex);
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [readyUserIds, setReadyUserIds] = useState<Set<string>>(
    new Set(initialReadyUserIds),
  );
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(
    new Set(initialOnlineUserIds || [userId]),
  );
  const onlineUserIdsRef = useRef<Set<string>>(
    new Set(initialOnlineUserIds || [userId]),
  );
  const [isReady, setIsReady] = useState(initialReadyUserIds.includes(userId));
  const [syncing, setSyncing] = useState(false);
  const [syncCooldown, setSyncCooldown] = useState(0);

  const [startTime, setStartTime] = useState<number | undefined>(
    initialStartTime,
  );
  const [timeLimit, setTimeLimit] = useState<number | undefined>(
    initialTimeLimit,
  );
  const [timeLeft, setTimeLeft] = useState<string>("00:00");

  // Notification permission state — used to render the "Enable Notifications" button
  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted",
  );

  useEffect(() => {
    if (matchState !== "active" || !startTime || !timeLimit) {
      if (matchState === "completed") {
        setTimeLeft("00:00");
      } else {
        setTimeLeft(
          timeLimit
            ? `${Math.floor(timeLimit / 60)
                .toString()
                .padStart(
                  2,
                  "0",
                )}:${(timeLimit % 60).toString().padStart(2, "0")}`
            : "00:00",
        );
      }
      return;
    }
    const endMs = startTime + timeLimit * 1000;
    const interval = setInterval(() => {
      const diffSecs = Math.floor((endMs - Date.now()) / 1000);
      if (diffSecs <= 0) {
        setTimeLeft("00:00");
        return;
      }
      const m = Math.floor(diffSecs / 60);
      const s = diffSecs % 60;
      setTimeLeft(
        `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`,
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [matchState, startTime, timeLimit]);

  const isSoloFormat = ["1v1", "solo-tournament"].includes(contest?.format);
  const getDisplayTeamName = (t: any) => {
    if (!t) return "Unknown";
    if (isSoloFormat && t.members && t.members.length > 0) {
      return getDisplayName(t.members[0].name, t.members[0].pizza_count);
    }
    return t.name;
  };

  useEffect(() => {
    if (syncCooldown > 0) {
      const timer = setInterval(() => {
        setSyncCooldown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [syncCooldown]);

  useEffect(() => {
    const lastSyncStr = localStorage.getItem(`sync_${roomId}_${userId}`);
    if (lastSyncStr) {
      const lastSync = parseInt(lastSyncStr, 10);
      const elapsed = (Date.now() - lastSync) / 1000;
      if (elapsed < syncCooldownSeconds && elapsed > 0) {
        setSyncCooldown(Math.ceil(syncCooldownSeconds - elapsed));
      }
    }
  }, [roomId, userId, syncCooldownSeconds]);

  // Each entry stores { icon, text, timestamp (epoch ms), color, id }
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  const [, setTick] = useState(0); // forces re-render every second to update relative times
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const getRelativeTime = (epochMs: number): string => {
    const diffSecs = Math.floor((Date.now() - epochMs) / 1000);
    if (diffSecs < 5) return "just now";
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  const activityColorClass = (color: string) => {
    switch (color) {
      case "text-primary":
        return styles.actPrimary;
      case "text-error":
        return styles.actError;
      case "text-secondary":
        return styles.actSecondary;
      default:
        return styles.actDefault;
    }
  };

  const [animationKey, setAnimationKey] = useState(0); // For triggering CSS animations

  // Redirect to results page immediately ONLY if the match was already completed on initial load (i.e. refresh)
  useEffect(() => {
    if (initialMatchState === "completed") {
      router.replace(
        `/internal/contests/rooms/${roomId}/result${contest.format === "bracket" || contest.mode === "knockout" ? "?from=bracket" : ""}`,
      );
    }
  }, [initialMatchState, roomId, router, contest.format, contest.mode]);

  // Also redirect dynamically if the match completes while connected
  useEffect(() => {
    if (matchState === "completed" && initialMatchState !== "completed") {
      const t = setTimeout(() => {
        router.replace(
          `/internal/contests/rooms/${roomId}/result${contest.format === "bracket" || contest.mode === "knockout" ? "?from=bracket" : ""}`,
        );
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [
    matchState,
    initialMatchState,
    roomId,
    router,
    contest.format,
    contest.mode,
  ]);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/contests/stream?roomId=${roomId}`,
    );

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.payload) {
          handleEvent(data.payload);
        }
      } catch (err) {}
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleEvent = (payload: EventPayload) => {
    switch (payload.type) {
      case "room.state_sync":
        matchStateRef.current = payload.state.status;
        setMatchState((prev) => {
          if (prev !== "active" && payload.state.status === "active") {
            setShowMatchStartedModal(true);
          }
          return payload.state.status;
        });
        if (payload.state.startTime)
          setStartTime(parseInt(payload.state.startTime));
        if (payload.state.timeLimit)
          setTimeLimit(parseInt(payload.state.timeLimit));
        if (payload.problems) setProblems(payload.problems);
        if (payload.scores) setScores(payload.scores);
        if (payload.state.status === "active") {
          addActivity("info", "Match started! Good luck.");
        }
        break;
      case "room.advance":
        setCurrentProblemIndex(payload.problemIndex);
        setProblems((prev) => {
          const arr = [...prev];
          arr[payload.problemIndex] = payload.nextProblem;
          return arr;
        });
        setAnimationKey((k) => k + 1);
        const solverName = getMemberName(payload.solvedBy.userId);
        addActivity(
          "check_circle",
          `${solverName} solved a problem!`,
          "text-primary",
        );
        break;
      case "room.score":
        setScores(payload.scores);
        break;
      case "room.reclaimed": {
        const team = teams?.find((t: any) => t._id === payload.teamId);
        const tName = getDisplayTeamName(team);
        addActivity(
          "gavel",
          `CRITICAL: ${tName} RECLAIMED points for an earlier solve!`,
          "text-error",
        );
        break;
      }
      case "room.end":
        matchStateRef.current = "completed";
        setMatchState("completed");
        if (payload.finalScores) setScores(payload.finalScores);
        if (payload.lastSolvedBy) {
          const solverName = getMemberName(payload.lastSolvedBy.userId);
          addActivity(
            "check_circle",
            `${solverName} solved the final problem!`,
            "text-primary",
          );
        }
        break;
      case "sync.queued":
        setSyncing(true);
        addActivity(
          "sync",
          "Submission queued for verification...",
          "text-secondary",
        );
        break;
      case "sync.detected":
        setSyncing(false);
        if (payload.verdict === "OK") {
          addActivity(
            "check_circle",
            `Valid AC detected! +${payload.pointsAwarded || 100} pts`,
            "text-primary",
          );
        } else {
          addActivity(
            "error",
            `Submission failed: ${payload.verdict}`,
            "text-error",
          );
        }
        break;
      case "room.user_ready":
        setReadyUserIds((prev) => {
          const newSet = new Set(prev);
          newSet.add(payload.userId);
          return newSet;
        });
        if (payload.userId === userId) {
          setIsReady(true);
        }
        break;
      case "sync.failed":
        setSyncing(false);
        if (payload.verdict) {
          addActivity(
            "error",
            `Sync succeeded, but verdict is ${payload.verdict}`,
            "text-error",
          );
        } else {
          addActivity(
            "error",
            `Sync failed: ${payload.reason || "Unknown error"}`,
            "text-error",
          );
        }
        break;
      case "presence.online": {
        const uName = getMemberName(payload.userId);
        const wasOffline = !onlineUserIdsRef.current.has(payload.userId);

        if (wasOffline) {
          onlineUserIdsRef.current.add(payload.userId);
          setOnlineUserIds(new Set(onlineUserIdsRef.current));

          if (payload.cancelledForfeit) {
            addActivity(
              "person",
              `${uName} reconnected. Forfeiture cancelled.`,
              "text-secondary",
            );
          } else {
            addActivity(
              "person",
              `${uName} connected${matchStateRef.current === "waiting" ? " (Not Ready)" : ""}.`,
              "text-secondary",
            );
          }
        }
        break;
      }
      case "presence.offline": {
        const uName = getMemberName(payload.userId);
        onlineUserIdsRef.current.delete(payload.userId);
        setOnlineUserIds(new Set(onlineUserIdsRef.current));

        setReadyUserIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(payload.userId);
          return newSet;
        });
        const text = payload.forfeitTimeout
          ? `${uName} disconnected. Match will be forfeited in ${payload.forfeitTimeout}s.`
          : `${uName} disconnected.`;
        addActivity("person_off", text, "text-error");
        break;
      }
    }
  };

  const getMemberName = (uid: string) => {
    if (!teams) return "Unknown";
    for (const t of teams) {
      for (const m of t.members) {
        if (m.id === uid) return getDisplayName(m.name, m.pizza_count);
      }
    }
    return uid === userId ? "You" : "Unknown";
  };

  const addActivity = (
    icon: string,
    text: string,
    color: string = "text-on-surface",
  ) => {
    setActivityFeed((prev) =>
      [
        {
          icon,
          text,
          timestamp: Date.now(),
          color,
          id: Date.now() + Math.random(),
        },
        ...prev,
      ].slice(0, 10),
    );
    // Fire a matching desktop notification
    sendBrowserNotification(icon, text);
  };

  const handleReady = async () => {
    setIsReady(true);
    await fetch(`/api/contests/rooms/${roomId}/ready`, { method: "POST" });
  };

  const handleSync = async () => {
    if (syncing || matchState !== "active" || syncCooldown > 0) return;
    setSyncing(true);
    const activeProblem = problems[currentProblemIndex];
    if (!activeProblem) return;

    const res = await fetch("/api/contests/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        teamId,
        cfHandle: cfHandle || "dummy0", // Use real handle if available, otherwise fallback
        problemId: activeProblem.problemId,
      }),
    });

    setSyncCooldown(syncCooldownSeconds);
    localStorage.setItem(`sync_${roomId}_${userId}`, Date.now().toString());

    if (!res.ok) {
      // If it failed immediately (Eg. 429), turn off syncing spinner since SSE won't fire
      setSyncing(false);
    }
  };

  const activeProblem = problems[currentProblemIndex] || {
    name: "Loading...",
    rating: 0,
  };
  const totalProblems = problems.length || 5;

  return (
    <div className={styles.page}>
      <div className={styles.bgPattern} aria-hidden="true"></div>

      <main className={styles.main}>
        <div>
          <Link
            href={
              from === "bracket"
                ? `/internal/contests/${contest._id}`
                : "/internal/contests"
            }
            className={styles.backLink}
          >
            <ArrowLeft className={styles.icon18} size={18} />
            {from === "bracket" ? "Back to Bracket Canvas" : "Back to Contests"}
          </Link>
        </div>

        {/* Compact HUD */}
        <header className={styles.hud}>
          <div className={styles.hudLeft}>
            <h1 className={styles.hudTitle}>{contest.name}</h1>
            <div
              className={`${styles.statusBadge} ${
                matchState === "active" ? styles.statusBadgeActive : ""
              }`}
            >
              {matchState === "active" && (
                <span className={styles.statusDot}></span>
              )}
              {matchState === "active"
                ? "LIVE MATCH"
                : matchState === "completed"
                  ? "MATCH OVER"
                  : "WAITING FOR PLAYERS"}
            </div>
          </div>
          <div className={styles.scoreRow}>
            {teams && teams.length >= 2 ? (
              <>
                <span
                  className={
                    teams[0]._id === teamId
                      ? styles.teamNameActive
                      : styles.teamName
                  }
                >
                  {getDisplayTeamName(teams[0])}
                </span>
                <span className={styles.scoreVal}>
                  {scores[teams[0]._id] || 0} pts
                </span>
                <span className={styles.vs}>VS</span>
                <span className={styles.scoreVal}>
                  {scores[teams[1]._id] || 0} pts
                </span>
                <span
                  className={
                    teams[1]._id === teamId
                      ? styles.teamNameActive
                      : styles.teamName
                  }
                >
                  {getDisplayTeamName(teams[1])}
                </span>
              </>
            ) : (
              teams?.map((t, idx) => (
                <span key={t._id} className={styles.teamScoreGroup}>
                  <span
                    className={
                      t._id === teamId ? styles.teamNameActive : styles.teamName
                    }
                  >
                    {getDisplayTeamName(t)}
                  </span>
                  <span className={styles.scoreVal}>
                    {scores[t._id] || 0} pts
                  </span>
                  {idx < teams.length - 1 && (
                    <span className={styles.vsInline}>VS</span>
                  )}
                </span>
              ))
            )}
          </div>
          {/* Countdown Timer */}
          <div className={styles.timerBox}>
            <Timer className={styles.timerIcon} size={18} />
            <span className={styles.timerText}>
              {timeLeft} <span className={styles.timerSub}>remaining</span>
            </span>
          </div>
        </header>

        {/* 3-Column Layout */}
        <div className={styles.grid}>
          {/* Left Sidebar (Roster) */}
          <div className={styles.sideCol}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Active Roster</h2>

              {teams?.map((team) => (
                <div key={team._id} className={styles.rosterTeam}>
                  {!isSoloFormat && (
                    <span
                      className={`${styles.rosterTeamName} ${
                        team._id === teamId ? styles.rosterTeamNameOwn : ""
                      }`}
                    >
                      {team.name}
                    </span>
                  )}
                  {team.members.map((member: any) => {
                    const memberIsReady = readyUserIds.has(member.id);
                    const memberIsOnline = onlineUserIds.has(member.id);

                    const borderClass = !memberIsOnline
                      ? styles.borderError
                      : memberIsReady || matchState !== "waiting"
                        ? styles.borderPrimary
                        : styles.borderNone;
                    const dotClass = !memberIsOnline
                      ? styles.dotError
                      : matchState === "waiting" && !memberIsReady
                        ? styles.dotMuted
                        : styles.dotPrimary;

                    return (
                      <div
                        key={member.id}
                        className={`${styles.memberRow} ${borderClass}`}
                      >
                        <img
                          src={
                            member.avatar ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name || "U")}&background=random`
                          }
                          alt={member.name}
                          className={`${styles.memberAvatar} ${
                            memberIsOnline ? "" : styles.memberAvatarOffline
                          }`}
                        />
                        <span className={styles.memberName}>
                          {getDisplayName(member.name, member.pizza_count)}{" "}
                          {member.id === userId && "(You)"}
                        </span>
                        <div
                          className={`${styles.statusDotSm} ${dotClass}`}
                        ></div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Center Stage - Active Problem */}
          <div className={styles.centerCol}>
            <div className={`${styles.panel} ${styles.panelStage}`}>
              {/* Center Stage - Active Problem / Waiting Room */}
              {matchState === "waiting" ? (
                <div className={styles.waiting}>
                  <div className={styles.waitingIcon}>
                    <Users size={48} />
                  </div>
                  <h2 className={styles.waitingTitle}>Waiting for Players</h2>
                  <p className={styles.waitingText}>
                    The arena is being prepared. Review your strategy—the match
                    begins when all teams are ready.
                  </p>
                  <button
                    onClick={handleReady}
                    disabled={isReady}
                    className={styles.readyBtn}
                  >
                    {isReady ? (
                      <span className={styles.animatedDots}>
                        Ready! Waiting on others
                      </span>
                    ) : (
                      "I am Ready"
                    )}
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.problemHead}>
                    <div className={styles.problemCount}>
                      <Target
                        className={`${styles.problemCountText} ${styles.icon16}`}
                        size={16}
                      />
                      <span className={styles.problemCountText}>
                        Problem {currentProblemIndex + 1} of {totalProblems}
                      </span>
                    </div>
                    <div className={styles.progressBars}>
                      {Array.from({ length: totalProblems }).map((_, i) => (
                        <div
                          key={i}
                          className={`${styles.progressBar} ${
                            i < currentProblemIndex
                              ? styles.progressBarDone
                              : i === currentProblemIndex
                                ? styles.progressBarCurrent
                                : ""
                          }`}
                        ></div>
                      ))}
                    </div>
                  </div>

                  <div key={animationKey} className={styles.problemCard}>
                    <div className={styles.problemWatermark}>
                      <Code size={96} />
                    </div>
                    <div className={styles.problemBody}>
                      <h1 className={styles.problemTitle}>
                        {activeProblem.problemId
                          ? `${activeProblem.problemId} - `
                          : ""}
                        {activeProblem.name}
                      </h1>
                      <div className={styles.problemMeta}>
                        <span className={styles.metaChip}>
                          <BarChart3 className={styles.icon16} size={16} />
                          Rating: {activeProblem.rating}
                        </span>
                        <span className={styles.metaPoints}>
                          <Sparkles className={styles.icon16} size={16} />
                          Points: {activeProblem.points || 100}
                        </span>
                      </div>
                    </div>

                    <div className={styles.problemActions}>
                      <a
                        href={`https://codeforces.com/contest/${activeProblem.problemId?.replace(/[^0-9]/g, "")}/problem/${activeProblem.problemId?.replace(/[0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.cfLink}
                      >
                        <ExternalLink size={16} />
                        Open in Codeforces
                      </a>
                      <button
                        onClick={handleSync}
                        disabled={
                          syncing || matchState !== "active" || syncCooldown > 0
                        }
                        className={styles.syncBtn}
                      >
                        {syncCooldown > 0 && !syncing ? (
                          <Hourglass size={16} />
                        ) : (
                          <RefreshCw
                            className={syncing ? styles.spin : ""}
                            size={16}
                          />
                        )}
                        {syncing
                          ? "Syncing..."
                          : syncCooldown > 0
                            ? `Wait ${syncCooldown}s`
                            : "Sync Submission"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Sidebar (Activity Log) */}
          <div className={styles.sideCol}>
            <div className={`${styles.panel} ${styles.panelStage}`}>
              <div className={styles.activityHead}>
                <h2 className={styles.activityTitle}>
                  <Rss size={18} />
                  Activity Feed
                </h2>
                <p className={styles.activitySub}>
                  Logs since last refresh. May disappear on reload.
                </p>
                {typeof Notification !== "undefined" && !notifGranted && (
                  <button
                    className={styles.notifBtn}
                    onClick={() =>
                      Notification.requestPermission().then((perm) =>
                        setNotifGranted(perm === "granted"),
                      )
                    }
                  >
                    🔔 Enable Notifications
                  </button>
                )}
              </div>
              <div className={styles.activityList}>
                {activityFeed.length === 0 ? (
                  <p className={styles.activityEmpty}>No activity yet.</p>
                ) : (
                  activityFeed.map((act) => (
                    <div key={act.id} className={styles.activityItem}>
                      <div className={styles.activityIconWrap}>
                        {createElement(ACTIVITY_ICON_MAP[act.icon] ?? Info, {
                          className: `${activityColorClass(act.color)} ${styles.icon16}`,
                          size: 16,
                        })}
                      </div>
                      <div>
                        <p className={styles.activityText}>{act.text}</p>
                        <span className={styles.activityTime}>
                          {getRelativeTime(act.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Match Started Overlay Modal */}
      {showMatchStartedModal && (
        <div className={styles.toast}>
          <div className={styles.toastCard}>
            <div className={styles.toastAccent}></div>
            <div className={styles.toastHeader}>
              <div className={styles.toastHeaderLeft}>
                <Play className={styles.toastIcon} size={28} />
                <h3 className={styles.toastTitle}>Match Started!</h3>
              </div>
            </div>
            <p className={styles.toastText}>
              The first problem has been revealed. Good luck!
            </p>
            <button
              onClick={() => setShowMatchStartedModal(false)}
              className={styles.toastBtn}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Match Over Overlay Modal */}
      {matchState === "completed" && (
        <div className={styles.toast}>
          <div className={styles.toastCard}>
            <div className={styles.toastAccent}></div>
            <div className={styles.toastHeader}>
              <div className={styles.toastHeaderLeft}>
                <Trophy className={styles.toastIcon} size={28} />
                <h3 className={styles.toastTitle}>Match Over!</h3>
              </div>
              <button className={styles.toastClose}>
                <X size={18} />
              </button>
            </div>
            <p className={styles.toastText}>
              Final Scores: <br />
              <strong className={styles.toastScoreOwn}>
                {teams?.[0] ? getDisplayTeamName(teams[0]) : "Team Alpha"}:{" "}
                {teams?.[0]
                  ? scores[teams[0]._id] || 0
                  : Object.values(scores)[0] || 0}
              </strong>
              <br />
              <strong className={styles.toastScoreOther}>
                {teams?.[1] ? getDisplayTeamName(teams[1]) : "Team Beta"}:{" "}
                {teams?.[1]
                  ? scores[teams[1]._id] || 0
                  : Object.values(scores)[1] || 0}
              </strong>
            </p>
            <button
              onClick={() =>
                router.push(
                  `/internal/contests/rooms/${roomId}/result${contest.format === "bracket" || contest.mode === "knockout" ? "?from=bracket" : ""}`,
                )
              }
              className={styles.toastBtnSecondary}
            >
              View Match Results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
