"use client";

import Link from "next/link";
import { ContestListingItem } from "@/lib/actions/contests";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface EventPayload {
  type: string;
  [key: string]: any;
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
  teams?: any[];
  initialMatchState?: "waiting" | "active" | "completed";
  initialProblems?: any[];
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
  const [problems, setProblems] = useState<any[]>(initialProblems);
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
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  const [, setTick] = useState(0);
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

  const [startTime, setStartTime] = useState<number | undefined>(
    initialStartTime,
  );
  const [timeLimit, setTimeLimit] = useState<number | undefined>(
    initialTimeLimit,
  );
  const [timeLeft, setTimeLeft] = useState<string>("00:00");

  const isSoloFormat = ["1v1", "solo-tournament"].includes(contest?.format);
  const getDisplayTeamName = (t: any) => {
    if (!t) return "Unknown";
    if (isSoloFormat && t.members && t.members.length > 0) {
      return t.members[0].name;
    }
    return t.name;
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

  useEffect(() => {
    const lastSyncStr = localStorage.getItem(`sync_${roomId}_${userId}`);
    if (lastSyncStr) {
      const lastSync = parseInt(lastSyncStr, 10);
      const elapsed = (Date.now() - lastSync) / 1000;
      if (elapsed < syncCooldownSeconds && elapsed > 0) {
        setSyncCooldown(Math.ceil(syncCooldownSeconds - elapsed));
      }
    }
  }, [roomId, userId]);

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
    if (matchState !== "active" || !startTime || !timeLimit) {
      if (matchState === "completed") {
        setTimeLeft("00:00");
      } else {
        // Fallback or waiting state
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
      const nowMs = Date.now();
      const diffSecs = Math.floor((endMs - nowMs) / 1000);
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

  const stateRef = useRef({ locks, problems, teams, userId });
  useEffect(() => {
    stateRef.current = { locks, problems, teams, userId };
  }, [locks, problems, teams, userId]);

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

    return () => eventSource.close();
  }, [roomId]); // Removed dynamic dependencies to prevent SSE disconnections

  const handleEvent = (payload: EventPayload) => {
    switch (payload.type) {
      case "room.state_sync":
        matchStateRef.current = payload.state.status;
        setMatchState(payload.state.status);
        if (payload.state.startTime)
          setStartTime(parseInt(payload.state.startTime));
        if (payload.state.timeLimit)
          setTimeLimit(parseInt(payload.state.timeLimit));
        if (payload.problems) setProblems(payload.problems);
        if (payload.scores) setScores(payload.scores);
        if (payload.locks) setLocks(payload.locks);
        if (payload.state.status === "active") {
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
          tName = t.members[0].name;
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
          setSyncingMap((prev) => ({ ...prev, [payload.problemId]: true }));
        }
        addActivity(
          "sync",
          "Submission queued for verification...",
          "text-secondary",
        );
        break;
      case "sync.detected":
        if (payload.problemId) {
          setSyncingMap((prev) => ({ ...prev, [payload.problemId]: false }));
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
          setSyncingMap((prev) => ({ ...prev, [payload.problemId]: false }));
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

  const getMemberName = (uid: string) => {
    if (!teams) return "Unknown";
    for (const t of teams) {
      for (const m of t.members) {
        if (m.id === uid) return m.name;
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
  };

  const handleReady = async () => {
    setIsReady(true);
    await fetch(`/api/contests/rooms/${roomId}/ready`, { method: "POST" });
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

    if (!res.ok) {
      setSyncingMap((prev) => ({ ...prev, [problemId]: false }));
    }
  };

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hanken+Grotesk:wght@600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        rel="stylesheet"
      />
      <div className="flex-1 flex flex-col overflow-hidden relative dark stitch-container bg-background w-full h-full text-on-background font-body-md selection:bg-primary-container selection:text-on-primary-container">
        <style>{`
          .cyber-glow { box-shadow: 0 0 15px rgba(136, 217, 130, 0.2); }
          .cyber-glow-error { box-shadow: 0 0 15px rgba(255, 180, 171, 0.1); }
          .scroll-hide::-webkit-scrollbar { display: none; }
          .scroll-hide { -ms-overflow-style: none; scrollbar-width: none; }
          .bg-pattern { background-image: radial-gradient(rgba(136, 217, 130, 0.05) 1px, transparent 1px); background-size: 24px 24px; }
          @keyframes slide-in {
            0% { opacity: 0; transform: translateX(20px); }
            100% { opacity: 1; transform: translateX(0); }
          }
          .problem-transition { animation: slide-in 0.4s ease-out forwards; }
          @keyframes loading-dots {
            0% { content: ''; }
            25% { content: '.'; }
            50% { content: '..'; }
            75%, 100% { content: '...'; }
          }
          .animated-dots::after {
            content: '';
            animation: loading-dots 1.5s infinite;
            display: inline-block;
            width: 20px;
            text-align: left;
          }
        `}</style>
        <div className="absolute inset-0 bg-pattern opacity-30 pointer-events-none"></div>

        {/* Main Content Canvas */}
        <main className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-6 relative z-10 max-w-container-max-width mx-auto w-full">
          <div className="flex items-center">
            <Link
              href={
                from === "bracket"
                  ? `/internal/contests/${contest._id}`
                  : "/internal/contests"
              }
              className="flex items-center gap-2 px-3 py-1.5 text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20 rounded-lg transition-all font-label-sm text-label-sm uppercase tracking-wider"
            >
              <span className="material-symbols-outlined text-[18px]">
                arrow_back
              </span>
              {from === "bracket"
                ? "Back to Bracket Canvas"
                : "Back to Contests"}
            </Link>
          </div>

          {/* Compact HUD */}
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface-container-low border border-outline-variant p-4 rounded-xl cyber-glow gap-4">
            <div className="flex items-center gap-4">
              <h1 className="font-headline-lg text-[20px] text-on-surface tracking-tight">
                {contest.name}
              </h1>
              <div
                className={`flex items-center gap-2 px-3 py-1 bg-surface-container border rounded-full font-label-sm text-xs uppercase tracking-wider ${matchState === "active" ? "border-primary/30 text-primary" : "border-outline-variant text-on-surface-variant"}`}
              >
                {matchState === "active" && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                )}
                {matchState === "active"
                  ? "LIVE MATCH"
                  : matchState === "completed"
                    ? "MATCH OVER"
                    : "WAITING FOR PLAYERS"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-headline-lg text-[24px]">
              {teams?.map((t, idx) => (
                <div key={t._id} className="flex items-center gap-2">
                  <span
                    className={`${t._id === teamId ? "text-primary" : "text-on-surface-variant text-lg"} truncate max-w-[150px]`}
                  >
                    {getDisplayTeamName(t)}
                  </span>
                  <span className="text-on-surface font-bold">
                    {scores[t._id] || 0}
                  </span>
                  {idx < (teams.length || 0) - 1 && (
                    <span className="text-outline-variant font-body-md text-sm mx-2">
                      VS
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 bg-surface-container py-2 px-4 border border-outline-variant rounded-lg">
              <span className="material-symbols-outlined text-primary">
                timer
              </span>
              <span className="font-label-sm text-label-sm text-on-surface">
                {timeLeft}{" "}
                <span className="text-on-surface-variant text-xs">
                  remaining
                </span>
              </span>
            </div>
          </header>

          {/* 3-Column Layout */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-hidden">
            {/* Left Sidebar (Roster) */}
            <div className="lg:col-span-1 flex flex-col h-full overflow-hidden">
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col gap-4 h-full overflow-y-auto scroll-hide">
                <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest sticky top-0 bg-surface-container-low z-10 pb-2 border-b border-outline-variant/50">
                  Active Roster
                </h2>

                {teams?.map((team) => (
                  <div
                    key={team._id}
                    className="flex flex-col gap-2 mt-4 first:mt-0"
                  >
                    {!isSoloFormat && (
                      <span
                        className={`font-label-sm text-[10px] uppercase tracking-widest pb-1 mb-1 ${team._id === teamId ? "text-primary" : "text-secondary"}`}
                      >
                        {team.name}
                      </span>
                    )}
                    {team.members.map((member: any) => {
                      const memberIsReady = readyUserIds.has(member.id);
                      const memberIsOnline = onlineUserIds.has(member.id);

                      const borderColor = !memberIsOnline
                        ? "border-error"
                        : memberIsReady || matchState !== "waiting"
                          ? "border-primary"
                          : "border-transparent";
                      const dotColor = !memberIsOnline
                        ? "bg-error"
                        : matchState === "waiting" && !memberIsReady
                          ? "bg-outline-variant"
                          : "bg-primary";

                      return (
                        <div
                          key={member.id}
                          className={`flex items-center gap-3 p-2 rounded bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors border-l-2 ${borderColor}`}
                        >
                          <img
                            src={
                              member.avatar ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name || "U")}&background=random`
                            }
                            alt={member.name}
                            className={`w-6 h-6 rounded-full object-cover border ${memberIsOnline ? "border-primary/50" : "border-error/50 grayscale"}`}
                          />
                          <span className="font-label-sm text-sm text-on-surface flex-1 truncate">
                            {member.name} {member.id === userId && "(You)"}
                          </span>
                          <div
                            className={`w-2 h-2 rounded-full ${dotColor}`}
                          ></div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Center Stage - Problem Grid */}
            <div className="lg:col-span-2 flex flex-col h-full overflow-hidden">
              <div className="flex-1 flex flex-col bg-surface-container-low border border-outline-variant rounded-xl p-6 overflow-y-auto scroll-hide relative">
                {matchState === "waiting" ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 cyber-glow">
                      <span className="material-symbols-outlined text-6xl text-primary animate-pulse">
                        groups
                      </span>
                    </div>
                    <h2 className="text-3xl font-bold mb-4 text-on-surface">
                      Waiting for Players
                    </h2>
                    <p className="text-on-surface-variant mb-8 max-w-md text-lg">
                      The arena is being prepared. Review your strategy—the
                      match begins when all teams are ready.
                    </p>
                    <button
                      onClick={handleReady}
                      disabled={isReady}
                      className="w-full max-w-sm px-8 py-4 bg-primary-container text-white border border-primary/50 rounded-lg font-label-sm font-bold tracking-widest uppercase text-lg transition-all duration-300 shadow-[0_4px_20px_rgba(46,125,50,0.4)] hover:shadow-[0_0_25px_rgba(46,125,50,0.7)] disabled:opacity-50"
                      style={{ cursor: isReady ? "default" : "pointer" }}
                    >
                      {isReady ? (
                        <span className="animated-dots">
                          Ready! Waiting on others
                        </span>
                      ) : (
                        "I am Ready"
                      )}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-6 sticky top-0 bg-surface-container-low z-20 pb-2 border-b border-outline-variant/50">
                      <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
                        Problem Grid
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max pb-4">
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

                        // Colors & Styling
                        const borderColor = isClaimed
                          ? claimedByMe
                            ? "border-primary"
                            : "border-error"
                          : "border-outline-variant hover:border-primary/50";
                        const bgColor = isClaimed
                          ? claimedByMe
                            ? "bg-surface"
                            : "bg-surface opacity-75"
                          : "bg-surface";
                        const glow =
                          isClaimed && claimedByMe ? "cyber-glow" : "";
                        const badgeBg = isClaimed
                          ? claimedByMe
                            ? "bg-primary-container text-on-primary-container"
                            : "bg-error-container text-on-error-container"
                          : "bg-surface-variant text-on-surface";
                        const isSyncing = syncingMap[prob.problemId];

                        return (
                          <div
                            key={prob.problemId}
                            className={`${bgColor} border-2 ${borderColor} p-5 rounded-lg flex flex-col gap-4 relative overflow-hidden group ${glow} transition-colors`}
                          >
                            {isClaimed && (
                              <div className="absolute top-0 right-0 p-2 opacity-10">
                                <span
                                  className={`material-symbols-outlined text-6xl ${claimedByMe ? "text-primary" : "text-error"}`}
                                >
                                  {claimedByMe ? "check_circle" : "lock"}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between items-start z-10">
                              <span
                                className={`font-label-sm text-label-sm px-2 py-1 rounded ${badgeBg}`}
                              >
                                {prob.rating}
                              </span>
                              <span
                                className={`material-symbols-outlined ${isClaimed ? (claimedByMe ? "text-primary" : "text-error") : "text-on-surface-variant group-hover:text-primary"}`}
                              >
                                {isClaimed
                                  ? claimedByMe
                                    ? "code"
                                    : "lock"
                                  : "code"}
                              </span>
                            </div>
                            <div className="z-10">
                              <h3
                                className="font-label-sm text-label-sm text-on-surface mb-1 truncate"
                                title={prob.name}
                              >
                                {prob.problemId ? `${prob.problemId} - ` : ""}
                                {prob.name}
                              </h3>
                              <p className="text-xs text-primary font-label-sm font-bold">
                                {prob.points || 100} pts
                              </p>
                            </div>

                            <div className="mt-auto pt-4 border-t border-outline-variant/50 flex flex-wrap items-center justify-between gap-3 z-10">
                              {isClaimed ? (
                                <div className="flex items-center gap-2 max-w-[50%]">
                                  <div
                                    className={`flex flex-col ${claimedByMe ? "text-primary" : "text-error"}`}
                                  >
                                    <span
                                      className="font-label-sm text-xs truncate"
                                      title={claimedByWhoName}
                                    >
                                      {claimedByWhoName}
                                    </span>
                                    <span className="text-[10px] opacity-80 font-label-sm">
                                      Locked
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="font-label-sm text-xs text-on-surface-variant">
                                  Unclaimed
                                </span>
                              )}

                              <div className="flex items-center gap-2 ml-auto">
                                <a
                                  href={`https://codeforces.com/contest/${prob.problemId.replace(/[^0-9]/g, "")}/problem/${prob.problemId.replace(/[0-9]/g, "")}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-2 rounded bg-surface-variant hover:bg-outline-variant text-on-surface transition-colors flex items-center justify-center"
                                  title="Open in Codeforces"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    open_in_new
                                  </span>
                                </a>
                                <button
                                  onClick={() => handleSync(prob.problemId)}
                                  disabled={
                                    isClaimed ||
                                    isSyncing ||
                                    matchState !== "active" ||
                                    syncCooldown > 0
                                  }
                                  className={`flex items-center gap-1 px-3 py-1.5 rounded font-label-sm text-xs transition-colors ${
                                    isClaimed ||
                                    isSyncing ||
                                    matchState !== "active" ||
                                    syncCooldown > 0
                                      ? "bg-surface-variant text-outline opacity-50 cursor-not-allowed"
                                      : "bg-primary-container text-on-primary-container hover:brightness-110 shadow-sm"
                                  }`}
                                >
                                  <span
                                    className={`material-symbols-outlined text-[14px] ${isSyncing && !isClaimed ? "animate-spin" : ""}`}
                                  >
                                    {isClaimed
                                      ? "lock"
                                      : isSyncing
                                        ? "sync"
                                        : syncCooldown > 0
                                          ? "hourglass_empty"
                                          : "sync"}
                                  </span>
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
            <div className="lg:col-span-1 flex flex-col h-full overflow-hidden">
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col h-full overflow-hidden relative">
                <div className="sticky top-0 bg-surface-container-low z-10 pb-2 border-b border-outline-variant/50 mb-4">
                  <h2 className="font-label-sm text-label-sm text-on-surface font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">
                      rss_feed
                    </span>
                    Activity Feed
                  </h2>
                </div>
                <div className="flex flex-col gap-4 overflow-y-auto scroll-hide font-label-sm text-label-sm h-full pb-4">
                  {activityFeed.length === 0 ? (
                    <p className="text-on-surface-variant text-center mt-4">
                      No activity yet.
                    </p>
                  ) : (
                    activityFeed.map((act) => (
                      <div
                        key={act.id}
                        className="flex gap-3 problem-transition"
                      >
                        <div className="mt-1">
                          <span
                            className={`material-symbols-outlined ${act.color} text-sm`}
                          >
                            {act.icon}
                          </span>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p
                            className={`text-on-surface break-words ${act.icon === "gavel" ? "font-bold text-error" : ""}`}
                          >
                            {act.text}
                          </p>
                          <span className="text-on-surface-variant text-[11px]">
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

        {/* Match Over Overlay Modal */}
        {matchState === "completed" && (
          <div
            className="fixed bottom-gutter right-gutter z-50 problem-transition"
            style={{ bottom: "24px", right: "24px" }}
          >
            <div className="bg-surface-container-highest border border-primary/30 rounded-xl p-6 shadow-2xl w-80 relative overflow-hidden cyber-glow">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary"></div>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-3xl">
                    emoji_events
                  </span>
                  <h3 className="font-headline-lg-mobile text-[24px] font-bold text-on-surface">
                    Match Over!
                  </h3>
                </div>
              </div>
              <div className="font-body-md text-on-surface-variant mb-6 flex flex-col gap-1">
                <span className="mb-2">Final Scores:</span>
                {teams?.map((t) => (
                  <div
                    key={t._id}
                    className="flex justify-between items-center bg-surface-container p-2 rounded"
                  >
                    <strong
                      className={
                        t._id === teamId ? "text-primary" : "text-on-surface"
                      }
                    >
                      {getDisplayTeamName(t)}
                    </strong>
                    <span className="font-bold">{scores[t._id] || 0} pts</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() =>
                  router.push(
                    `/internal/contests/rooms/${roomId}/result${contest.format === "bracket" || contest.mode === "knockout" ? "?from=bracket" : ""}`,
                  )
                }
                className="w-full py-2 bg-primary-container hover:brightness-110 text-on-primary-container rounded-lg font-label-sm text-label-sm transition-colors font-bold"
              >
                View Match Results
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
