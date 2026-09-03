"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Code,
  ExternalLink,
  Gavel,
  Hourglass,
  Info,
  Lock,
  type LucideIcon,
  RefreshCw,
  Rss,
  Timer,
  Trophy,
  User,
  UserX,
  Users,
} from "lucide-react";
import { ContestListingItem } from "@/lib/actions/contests";
import { readAppResult } from "@/lib/api/result";
import type {
  ContestRoomProblemDto,
  ContestRoomTeamDto,
  RoomActivityDto,
  RoomEventPayloadDto,
} from "@/lib/contests/dtos";

import React, { createElement, useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Info as IconInfoCircle,
  Gavel as IconGavel,
  Lock as IconLock,
  RefreshCw as IconSwitchView,
  CircleCheck as IconCheckCircle,
  TriangleAlert as IconWarning,
  Users as IconUsers,
  UserRoundX as IconPersonOff,
  Bell as IconBell,
} from "lucide-react";
import CompatibleImage from "@/components/shared/CompatibleImage";
import { useRouter } from "next/navigation";
import { getDisplayName } from "@/lib/utils";
import { useRoomEventSource } from "@/components/contests/useRoomEventSource";
import {
  formatRoomActivityTime,
  getContestRoomResultsPath,
} from "@/components/contests/roomPresentation";
import { useRoomCountdown } from "@/components/contests/useRoomCountdown";
import styles from "./ArenaRoomClient.module.scss";

const ACTIVITY_ICON_MAP: Record<string, LucideIcon> = {
  info: Info,
  gavel: Gavel,
  lock: Lock,
  sync: RefreshCw,
  check_circle: CircleCheck,
  error: CircleAlert,
  person: User,
  person_off: UserX,
};

// SVG sources (matching Lucide icons) for browser desktop notifications
// Icon color map matching the activity feed color scheme
const NOTIFICATION_ICON_MAP: Record<
  string,
  { component: React.FC<React.SVGProps<SVGSVGElement>>; color: string }
> = {
  info: { component: IconInfoCircle, color: "#8b5cf6" },
  gavel: { component: IconGavel, color: "#ef4444" },
  lock: { component: IconLock, color: "#8b5cf6" },
  sync: { component: IconSwitchView, color: "#06b6d4" },
  check_circle: { component: IconCheckCircle, color: "#22c55e" },
  error: { component: IconWarning, color: "#ef4444" },
  person: { component: IconUsers, color: "#06b6d4" },
  person_off: { component: IconPersonOff, color: "#ef4444" },
};

function getNotificationIconUri(icon: string): string {
  const entry = NOTIFICATION_ICON_MAP[icon] ?? NOTIFICATION_ICON_MAP.info;
  const svg = renderToStaticMarkup(
    createElement(entry.component, {
      width: 24,
      height: 24,
      stroke: entry.color,
    }),
  );
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function sendBrowserNotification(icon: string, text: string) {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  )
    return;
  try {
    new Notification("CCW Match", {
      body: text,
      icon: getNotificationIconUri(icon),
      silent: true,
    });
  } catch (_) {}
}

export default function ArenaRoomClient({
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
  initialLocks = {},
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
  teams?: ContestRoomTeamDto[];
  initialMatchState?: "waiting" | "active" | "completed";
  initialProblems?: ContestRoomProblemDto[];
  initialScores?: Record<string, number>;
  initialLocks?: Record<string, string>;
  initialReadyUserIds?: string[];
  initialOnlineUserIds?: string[];
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
  const [problems, setProblems] =
    useState<ContestRoomProblemDto[]>(initialProblems);
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [locks, setLocks] = useState<Record<string, string>>(initialLocks);
  const [readyUserIds, setReadyUserIds] = useState<Set<string>>(
    new Set(initialReadyUserIds),
  );
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(
    new Set(initialOnlineUserIds || [userId]),
  ); // Track online users
  const onlineUserIdsRef = useRef<Set<string>>(
    new Set(initialOnlineUserIds || [userId]),
  );
  const [isReady, setIsReady] = useState(initialReadyUserIds.includes(userId));

  const [syncingMap, setSyncingMap] = useState<Record<string, boolean>>({});
  const [syncCooldown, setSyncCooldown] = useState(0);
  const [activityFeed, setActivityFeed] = useState<RoomActivityDto[]>([]);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

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

  const [startTime, setStartTime] = useState<number | undefined>(
    initialStartTime,
  );
  const [timeLimit, setTimeLimit] = useState<number | undefined>(
    initialTimeLimit,
  );
  const timeLeft = useRoomCountdown(matchState, startTime, timeLimit);

  const isSoloFormat = ["1v1", "solo-tournament"].includes(contest?.format);
  const getDisplayTeamName = (team?: ContestRoomTeamDto) => {
    if (!team) return "Unknown";
    if (isSoloFormat && team.members.length > 0) {
      return getDisplayName(team.members[0].name, team.members[0].pizza_count);
    }
    return team.name;
  };

  useEffect(() => {
    if (syncCooldown > 0) {
      const timer = setInterval(
        () => setSyncCooldown((prev) => prev - 1),
        1000,
      );
      return () => clearInterval(timer);
    }
  }, [syncCooldown]);

  // Notification permission state - used to render the "Enable Notifications" button
  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== "undefined" &&
      Notification.permission === "granted",
  );

  useEffect(() => {
    const lastSyncStr = localStorage.getItem(`sync_${roomId}_${userId}`);
    if (lastSyncStr) {
      const lastSync = parseInt(lastSyncStr, 10);
      const elapsed = (Date.now() - lastSync) / 1000;
      if (elapsed < syncCooldownSeconds && elapsed > 0) {
        setSyncCooldown(Math.ceil(syncCooldownSeconds - elapsed));
      }
    }
  }, [roomId, syncCooldownSeconds, userId]);

  // Redirect to results page immediately ONLY if the match was already completed on initial load (i.e. refresh)
  useEffect(() => {
    if (initialMatchState === "completed") {
      router.replace(
        getContestRoomResultsPath(roomId, contest.format, contest.mode),
      );
    }
  }, [initialMatchState, roomId, router, contest.format, contest.mode]);

  // Also redirect dynamically if the match completes while connected
  useEffect(() => {
    if (matchState === "completed" && initialMatchState !== "completed") {
      const t = setTimeout(() => {
        router.replace(
          getContestRoomResultsPath(roomId, contest.format, contest.mode),
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

  const stateRef = useRef({ locks, problems, teams, userId });
  useEffect(() => {
    stateRef.current = { locks, problems, teams, userId };
  }, [locks, problems, teams, userId]);

  const handleEvent = (payload: RoomEventPayloadDto) => {
    switch (payload.type) {
      case "room.state_sync":
        const nextStatus = payload.state.status;
        if (
          nextStatus !== "waiting" &&
          nextStatus !== "active" &&
          nextStatus !== "completed"
        ) {
          break;
        }
        matchStateRef.current = nextStatus;
        setMatchState(nextStatus);
        if (payload.state.startTime)
          setStartTime(parseInt(payload.state.startTime));
        if (payload.state.timeLimit)
          setTimeLimit(parseInt(payload.state.timeLimit));
        if (payload.problems) setProblems(payload.problems);
        if (payload.scores) setScores(payload.scores);
        if (payload.locks) setLocks(payload.locks);
        // Hydrate from historical activity log on reconnect (server is source of truth)
        if (payload.activityLog && payload.activityLog.length > 0) {
          setActivityFeed(
            payload.activityLog.map((entry, i) => ({
              icon: entry.icon,
              text: entry.text,
              timestamp: entry.timestamp,
              color: entry.color,
              id: entry.timestamp + i,
            })),
          );
        } else if (nextStatus === "active") {
          // Fresh connect with no history — show the standard welcome entry
          addActivity("info", "Arena match started! Good luck.");
        }
        break;
      case "room.locked": {
        const existingLock = stateRef.current.locks[payload.problemId];
        const t = stateRef.current.teams?.find(
          (t) => t._id === payload.claimedBy,
        );
        let tName = t?.name || "Unknown Team";
        if (
          ["1v1", "solo-tournament"].includes(contest?.format) &&
          t?.members?.[0]
        ) {
          tName = getDisplayName(t.members[0].name, t.members[0].pizza_count);
        }
        const pName =
          stateRef.current.problems.find(
            (p) => p.problemId === payload.problemId,
          )?.name || payload.problemId;

        if (existingLock && existingLock.split("|")[0] !== payload.claimedBy) {
          addActivity(
            "gavel",
            `CRITICAL: ${tName} RECLAIMED ${payload.problemId} - ${pName}!`,
            "text-error",
          );
        } else {
          addActivity(
            "lock",
            `${tName} solved ${payload.problemId} - ${pName}`,
            "text-primary",
          );
        }

        setLocks((prev) => ({
          ...prev,
          [payload.problemId]: `${payload.claimedBy}|${payload.timestamp}`,
        }));
        break;
      }
      case "room.score":
        setScores(payload.scores);
        break;
      case "room.end":
        matchStateRef.current = "completed";
        setMatchState("completed");
        if (payload.finalScores) setScores(payload.finalScores);
        break;
      case "sync.queued":
        if (payload.problemId) {
          const problemId = payload.problemId;
          setSyncingMap((prev) => ({ ...prev, [problemId]: true }));
        }
        addActivity(
          "sync",
          "Submission queued for verification...",
          "text-secondary",
        );
        break;
      case "sync.detected":
        if (payload.problemId) {
          const problemId = payload.problemId;
          setSyncingMap((prev) => ({ ...prev, [problemId]: false }));
        }
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
      case "sync.failed":
        if (payload.problemId) {
          const problemId = payload.problemId;
          setSyncingMap((prev) => ({ ...prev, [problemId]: false }));
        }
        addActivity(
          "error",
          `Sync failed: ${payload.reason || payload.verdict || "Unknown error"}`,
          "text-error",
        );
        break;
      case "room.user_ready":
        setReadyUserIds((prev) => {
          const newSet = new Set(prev);
          newSet.add(payload.userId);
          return newSet;
        });
        if (payload.userId === stateRef.current.userId) {
          setIsReady(true);
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

  useRoomEventSource(roomId, handleEvent);

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
      ].slice(0, 15),
    );
    // Fire a matching desktop notification
    sendBrowserNotification(icon, text);
  };

  const handleReady = async () => {
    setIsReady(true);
    const response = await fetch(`/api/contests/rooms/${roomId}/ready`, {
      method: "POST",
    });
    if (!(await readAppResult(response)).ok) setIsReady(false);
  };

  const handleSync = async (problemId: string) => {
    if (syncingMap[problemId] || matchState !== "active" || syncCooldown > 0)
      return;

    setSyncCooldown(syncCooldownSeconds);

    const res = await fetch("/api/contests/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        teamId,
        cfHandle: cfHandle || "dummy0", // Use real handle if available, otherwise fallback
        problemId: problemId,
      }),
    });

    setSyncCooldown(syncCooldownSeconds); // Apply frontend cooldown directly
    localStorage.setItem(`sync_${roomId}_${userId}`, Date.now().toString());

    if (!(await readAppResult(res)).ok) {
      setSyncingMap((prev) => ({ ...prev, [problemId]: false }));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.bgPattern} aria-hidden="true"></div>

      {/* Main Content Canvas */}
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
            {teams?.map((t, idx) => (
              <div key={t._id} className={styles.teamScoreGroup}>
                <span
                  className={
                    t._id === teamId ? styles.teamNameActive : styles.teamName
                  }
                >
                  {getDisplayTeamName(t)}
                </span>
                <span className={styles.scoreVal}>{scores[t._id] || 0}</span>
                {idx < (teams.length || 0) - 1 && (
                  <span className={styles.vsInline}>VS</span>
                )}
              </div>
            ))}
          </div>
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
                  {team.members.map((member) => {
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
                        <CompatibleImage
                          src={
                            member.avatar ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name || "U")}&background=random`
                          }
                          alt={member.name}
                          className={`${styles.memberAvatar} ${
                            memberIsOnline ? "" : styles.memberAvatarOffline
                          }`}
                          width={40}
                          height={40}
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

          {/* Center Stage - Problem Grid */}
          <div className={styles.centerCol}>
            <div className={`${styles.panel} ${styles.panelStage}`}>
              {matchState === "waiting" ? (
                <div className={styles.waiting}>
                  <div className={styles.waitingIcon}>
                    <Users size={48} />
                  </div>
                  <h2 className={styles.waitingTitle}>Waiting for Players</h2>
                  <p className={styles.waitingText}>
                    The arena is being prepared. Review your strategy-the match
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
                  <div className={styles.gridHead}>
                    <h2 className={styles.gridHeadTitle}>Problem Grid</h2>
                  </div>

                  <div className={styles.problemGrid}>
                    {problems.map((prob) => {
                      const lockVal = locks[prob.problemId];
                      const isClaimed = !!lockVal;
                      let claimedByMe = false;
                      let claimedByWhoName = "Unknown";

                      if (isClaimed) {
                        const [cTeamId, cTimestamp] = lockVal.split("|");
                        claimedByMe = cTeamId === teamId;
                        const t = teams?.find((t) => t._id === cTeamId);
                        claimedByWhoName = t
                          ? getDisplayTeamName(t)
                          : "Unknown";
                      }

                      const cardStateClass = isClaimed
                        ? claimedByMe
                          ? styles.gridCardMine
                          : styles.gridCardOther
                        : styles.gridCardOpen;
                      const badgeClass = isClaimed
                        ? claimedByMe
                          ? styles.badgeMine
                          : styles.badgeOther
                        : styles.badgeOpen;
                      const topIconClass = isClaimed
                        ? claimedByMe
                          ? styles.topIconMine
                          : styles.topIconOther
                        : styles.topIconOpen;
                      const isSyncing = syncingMap[prob.problemId];

                      return (
                        <div
                          key={prob.problemId}
                          className={`${styles.gridCard} ${cardStateClass}`}
                        >
                          {isClaimed && (
                            <div
                              className={`${styles.lockOverlay} ${
                                claimedByMe
                                  ? styles.lockOverlayMine
                                  : styles.lockOverlayOther
                              }`}
                            >
                              {claimedByMe ? (
                                <CircleCheck size={64} />
                              ) : (
                                <Lock size={64} />
                              )}
                            </div>
                          )}
                          <div className={styles.gridCardHeader}>
                            <span
                              className={`${styles.ratingBadge} ${badgeClass}`}
                            >
                              {prob.rating}
                            </span>
                            {isClaimed && !claimedByMe ? (
                              <Lock className={topIconClass} size={18} />
                            ) : (
                              <Code className={topIconClass} size={18} />
                            )}
                          </div>
                          <div className={styles.gridCardBody}>
                            <h3
                              className={styles.gridCardTitle}
                              title={prob.name}
                            >
                              {prob.problemId ? `${prob.problemId} - ` : ""}
                              {prob.name}
                            </h3>
                            <p className={styles.gridCardPoints}>
                              {prob.points || 100} pts
                            </p>
                          </div>

                          <div className={styles.gridCardFooter}>
                            {isClaimed ? (
                              <div
                                className={`${styles.claimedInfo} ${
                                  claimedByMe
                                    ? styles.claimedInfoMine
                                    : styles.claimedInfoOther
                                }`}
                              >
                                <span
                                  className={styles.claimedName}
                                  title={claimedByWhoName}
                                >
                                  {claimedByWhoName}
                                </span>
                                <span className={styles.claimedLabel}>
                                  Locked
                                </span>
                              </div>
                            ) : (
                              <span className={styles.unclaimed}>
                                Unclaimed
                              </span>
                            )}

                            <div className={styles.gridCardActions}>
                              <a
                                href={`https://codeforces.com/contest/${prob.problemId.replace(/[^0-9]/g, "")}/problem/${prob.problemId.replace(/[0-9]/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.cfIconBtn}
                                title="Open in Codeforces"
                              >
                                <ExternalLink
                                  className={styles.icon16}
                                  size={16}
                                />
                              </a>
                              <button
                                onClick={() => handleSync(prob.problemId)}
                                disabled={
                                  isClaimed ||
                                  isSyncing ||
                                  matchState !== "active" ||
                                  syncCooldown > 0
                                }
                                className={styles.syncMini}
                              >
                                {isClaimed ? (
                                  <Lock className={styles.icon14} size={14} />
                                ) : isSyncing ? (
                                  <RefreshCw
                                    className={`${styles.icon14} ${styles.spin}`}
                                    size={14}
                                  />
                                ) : syncCooldown > 0 ? (
                                  <Hourglass
                                    className={styles.icon14}
                                    size={14}
                                  />
                                ) : (
                                  <RefreshCw
                                    className={styles.icon14}
                                    size={14}
                                  />
                                )}
                                {isClaimed
                                  ? "Locked"
                                  : isSyncing
                                    ? "Syncing"
                                    : syncCooldown > 0
                                      ? `${syncCooldown}s`
                                      : "Sync"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                      <div className={styles.activityBody}>
                        <p
                          className={`${styles.activityText} ${
                            act.icon === "gavel"
                              ? styles.activityTextCritical
                              : ""
                          }`}
                        >
                          {act.text}
                        </p>
                        <span className={styles.activityTime}>
                          {formatRoomActivityTime(act.timestamp)}
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
            </div>
            <div className={styles.toastScoreList}>
              <span>Final Scores:</span>
              {teams?.map((t) => (
                <div key={t._id} className={styles.toastScoreRow}>
                  <strong
                    className={
                      t._id === teamId ? styles.toastScoreOwn : undefined
                    }
                  >
                    {getDisplayTeamName(t)}
                  </strong>
                  <span>{scores[t._id] || 0} pts</span>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                router.push(
                  getContestRoomResultsPath(
                    roomId,
                    contest.format,
                    contest.mode,
                  ),
                )
              }
              className={styles.toastBtn}
            >
              View Match Results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
