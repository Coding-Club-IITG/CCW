"use client";

import {
  BarChart3,
  Code,
  ExternalLink,
  Hourglass,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CONTEST_TIMING } from "@/lib/constants";
import type { ContestListingItem } from "@/lib/actions/contests";
import { readAppResult } from "@/lib/api/result";
import type {
  ContestRoomProblemDto,
  ContestRoomTeamDto,
  RoomActivityDto,
  RoomEventPayloadDto,
} from "@/lib/contests/dtos";
import { getDisplayName } from "@/lib/users/identity";

import {
  getContestRoomResultsPath,
  getCodeforcesProblemUrl,
  getDisplayTeamName,
} from "@/components/contests/roomPresentation";
import RoomActivityFeed from "@/components/contests/RoomActivityFeed";
import { useSyncCooldown } from "@/components/contests/useSyncCooldown";
import { useContestWorkspace } from "./useContestWorkspace";
import { useRoomActivity } from "./useRoomActivity";
import { useRoomCountdown } from "@/components/contests/useRoomCountdown";
import { useRoomEventSource } from "@/components/contests/useRoomEventSource";
import UserAvatar from "@/components/shared/UserAvatar";
import BackLink from "@/components/shared/BackLink";
import ContestProblemWorkspace from "@/components/contests/ContestProblemWorkspace";
import { useRoomParticipation } from "@/components/contests/useRoomParticipation";
import { useMatchNavigationWarning } from "@/components/contests/useMatchNavigationWarning";
import Button from "@/components/shared/Button";

import styles from "./BlitzRoomClient.module.scss";

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
  initialJudgingDeadline,
  from,
  syncCooldownSeconds,
  isSpectator = false,
  initialActivityFeed = [],
  initialReadyDeadline,
  initialReadyOpensAt,
  initialAdmittedUserIds = [],
}: {
  contest: ContestListingItem;
  roomId: string;
  roomName: string;
  teamId: string | null;
  userId: string;
  cfHandle?: string;
  teams?: ContestRoomTeamDto[];
  initialReadyUserIds?: string[];
  initialOnlineUserIds?: string[];
  initialMatchState?: "waiting" | "active" | "completed";
  initialProblems?: ContestRoomProblemDto[];
  initialScores?: Record<string, number>;
  initialProblemIndex?: number;
  initialStartTime?: number;
  initialTimeLimit?: number;
  initialJudgingDeadline?: number;
  initialReadyDeadline?: number;
  initialReadyOpensAt?: number;
  initialAdmittedUserIds?: string[];
  from?: string;
  syncCooldownSeconds: number;
  isSpectator?: boolean;
  initialActivityFeed?: RoomActivityDto[];
}) {
  const router = useRouter();
  const { launcherRef, matchViewRef, ...workspace } = useContestWorkspace(
    roomId,
    userId,
  );
  const activity = useRoomActivity(initialActivityFeed, workspace.isOpen);
  const activityFeed = activity.entries;
  const addActivity = activity.add;

  const [matchState, setMatchState] = useState<
    "waiting" | "active" | "completed"
  >(initialMatchState);
  const [showMatchStartedModal, setShowMatchStartedModal] = useState(false);
  const [matchOverDismissed, setMatchOverDismissed] = useState(false);
  const [problems, setProblems] =
    useState<ContestRoomProblemDto[]>(initialProblems);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(
    null,
  );
  const [currentProblemIndex, setCurrentProblemIndex] =
    useState(initialProblemIndex);
  const [scores, setScores] = useState<Record<string, number>>(initialScores);

  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(
    new Set(initialOnlineUserIds || [userId]),
  );

  const onlineUserIdsRef = useRef<Set<string>>(
    new Set(initialOnlineUserIds || [userId]),
  );
  const {
    readyUserIds,
    admittedUserIds,
    syncParticipation,
    handleReady,
    isReady,
    isAdmitted,
    readySecondsLeft,
    opensInSeconds,
    entering,
    entryError,
  } = useRoomParticipation({
    roomId,
    userId,
    matchState,
    initialReadyUserIds,
    initialAdmittedUserIds,
    initialReadyDeadline,
    initialReadyOpensAt,
  });

  useMatchNavigationWarning(
    matchState === "active" && isAdmitted && !isSpectator,
  );
  const [syncing, setSyncing] = useState(false);
  const { cooldown: syncCooldown, begin: beginSync } = useSyncCooldown(
    roomId,
    userId,
    syncCooldownSeconds,
  );

  const [startTime, setStartTime] = useState<number | undefined>(
    initialStartTime,
  );
  const [timeLimit, setTimeLimit] = useState<number | undefined>(
    initialTimeLimit,
  );
  const [judgingDeadline, setJudgingDeadline] = useState(
    initialJudgingDeadline,
  );
  const timeLeft = useRoomCountdown(matchState, startTime, timeLimit);

  const isSoloFormat = ["1v1", "solo-tournament"].includes(contest?.format);
  const displayTeamName = (team?: ContestRoomTeamDto) =>
    getDisplayTeamName(team, contest?.format);

  // Redirect to results page immediately ONLY if the match was already completed on initial load
  useEffect(() => {
    if (initialMatchState === "completed") {
      router.replace(getContestRoomResultsPath(roomId, contest.format));
    }
  }, [initialMatchState, roomId, router, contest.format]);

  // Also redirect dynamically if the match completes while connected
  useEffect(() => {
    if (
      matchState === "completed" &&
      initialMatchState !== "completed" &&
      !workspace.isOpen
    ) {
      const t = setTimeout(() => {
        router.replace(getContestRoomResultsPath(roomId, contest.format));
      }, CONTEST_TIMING.resultRedirectMs);

      return () => clearTimeout(t);
    }
  }, [
    matchState,
    initialMatchState,
    roomId,
    router,
    contest.format,
    contest.mode,
    workspace.isOpen,
  ]);

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
        setMatchState((prev) => {
          if (prev !== "active" && nextStatus === "active") {
            setShowMatchStartedModal(true);
          }

          return nextStatus;
        });
        if (payload.state.startTime)
          setStartTime(parseInt(payload.state.startTime));
        setJudgingDeadline(
          payload.state.judgingDeadline
            ? Number(payload.state.judgingDeadline)
            : undefined,
        );
        if (payload.state.timeLimit)
          setTimeLimit(parseInt(payload.state.timeLimit));
        if (payload.onlineUserIds) {
          onlineUserIdsRef.current = new Set(payload.onlineUserIds);
          setOnlineUserIds(new Set(payload.onlineUserIds));
        }
        syncParticipation(payload);
        if (payload.state.currentProblem) {
          if (Number(payload.state.currentProblem) !== currentProblemIndex)
            setSelectedProblemId(null);
          setCurrentProblemIndex(Number(payload.state.currentProblem));
        }
        if (payload.problems) setProblems(payload.problems);
        if (payload.scores) setScores(payload.scores);
        if (payload.activityLogs) activity.snapshot(payload.activityLogs);
        break;
      case "room.end":
        setMatchState("completed");
        if (payload.finalScores) setScores(payload.finalScores);
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
            `Verdict: Accepted (OK) on ${payload.problemId || "problem"}!`,
            "text-primary",
          );
        } else {
          addActivity(
            "error",
            `Submission verdict: ${payload.verdict}`,
            "text-error",
          );
        }
        break;
      case "sync.failed":
        setSyncing(false);
        if (payload.verdict === "not_found") {
          addActivity(
            "error",
            `No recent submission found on Codeforces for ${payload.problemId || "problem"}.`,
            "text-error",
          );
        } else if (payload.verdict) {
          addActivity(
            "error",
            `Submission verdict: ${payload.verdict}`,
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
      case "presence.sync":
        onlineUserIdsRef.current = new Set(payload.onlineUserIds);
        setOnlineUserIds(new Set(payload.onlineUserIds));
        break;
      case "presence.online": {
        const wasOffline = !onlineUserIdsRef.current.has(payload.userId);

        if (wasOffline) {
          onlineUserIdsRef.current.add(payload.userId);
          setOnlineUserIds(new Set(onlineUserIdsRef.current));
        }

        break;
      }
      case "presence.offline": {
        onlineUserIdsRef.current.delete(payload.userId);
        setOnlineUserIds(new Set(onlineUserIdsRef.current));
        break;
      }
      case "room.activity":
        activity.receive(payload.activity);
        break;
    }
  };

  useRoomEventSource(roomId, userId, handleEvent);

  const handleSync = async (problemId: string) => {
    if (
      !cfHandle ||
      !problemId ||
      !isAdmitted ||
      isSpectator ||
      syncing ||
      matchState !== "active" ||
      syncCooldown > 0
    )
      return;

    setSyncing(true);

    try {
      const res = await fetch("/api/contests/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          teamId,
          cfHandle: cfHandle || "", // Use real handle if available
          problemId,
        }),
      });

      const syncRes = await readAppResult(res);

      if (!syncRes.ok) {
        // If it failed immediately (Eg. 429), turn off syncing spinner since SSE won't fire
        setSyncing(false);
        addActivity(
          "error",
          `Sync failed: ${syncRes.error.message || "Failed to initiate sync"}`,
          "text-error",
        );
      }
    } catch {
      setSyncing(false);
      addActivity(
        "error",
        "Sync failed: connection unavailable. Try again.",
        "text-error",
      );
    } finally {
      beginSync();
    }
  };

  const revealedProblems = problems.filter(
    (problem) => problem.revealedAt != null,
  );
  const activeProblem = revealedProblems.find(
    (problem) => problem.problemId === selectedProblemId,
  ) ??
    problems[currentProblemIndex] ??
    revealedProblems.at(-1) ?? {
      name: "Loading...",
      rating: 0,
    };
  const currentProblem =
    problems[currentProblemIndex] ?? revealedProblems.at(-1);
  const runnerProblem = revealedProblems.find(
    (problem) => problem.problemId === workspace.problemId,
  );
  const totalProblems = problems.length;
  const problemTimeLeft = useRoomCountdown(
    matchState,
    activeProblem.revealedAt ?? undefined,
    activeProblem.deadlineAt && activeProblem.revealedAt
      ? (activeProblem.deadlineAt - activeProblem.revealedAt) / 1000
      : undefined,
  );

  return (
    <div className={styles.page}>
      <div className={styles.bgPattern} aria-hidden="true"></div>

      <main
        className={`${styles.main} ${workspace.isOpen ? styles.mainWorkspace : ""}`}
      >
        <div
          ref={matchViewRef}
          className={styles.matchView}
          hidden={workspace.isOpen}
        >
          <div className={styles.backNav}>
            <BackLink
              href={
                from === "bracket"
                  ? `/internal/contests/${contest._id}`
                  : "/internal/contests"
              }
              label={
                from === "bracket"
                  ? "Back to Bracket Canvas"
                  : "Back to Contests"
              }
            />
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
                  ? judgingDeadline
                    ? "JUDGING"
                    : "LIVE MATCH"
                  : matchState === "completed"
                    ? "MATCH OVER"
                    : "WAITING FOR PLAYERS"}
              </div>
              {isSpectator && (
                <div
                  className={`${styles.statusBadge} ${styles.spectatorBadge}`}
                >
                  <Eye size={14} aria-hidden="true" /> Spectator Mode
                </div>
              )}
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
                    {displayTeamName(teams[0])}
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
                    {displayTeamName(teams[1])}
                  </span>
                </>
              ) : (
                teams?.map((t, idx) => (
                  <span key={t._id} className={styles.teamScoreGroup}>
                    <span
                      className={
                        t._id === teamId
                          ? styles.teamNameActive
                          : styles.teamName
                      }
                    >
                      {displayTeamName(t)}
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
                {judgingDeadline ? (
                  "Play ended"
                ) : (
                  <>
                    {timeLeft}{" "}
                    <span className={styles.timerSub}>remaining</span>
                  </>
                )}
              </span>
            </div>
          </header>

          {judgingDeadline && matchState === "active" && (
            <p role="status" className={styles.entryNotice}>
              Play has ended. On-time submissions can still be synced while
              judging finishes.
            </p>
          )}

          {/* 3-Column Layout */}
          <div className={styles.grid}>
            {/* Left Sidebar (Roster) */}
            <div className={styles.sideCol}>
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>Team Roster</h2>

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
                      const memberIsReady =
                        matchState === "active"
                          ? admittedUserIds.has(member.id)
                          : readyUserIds.has(member.id);
                      const memberIsOnline = onlineUserIds.has(member.id);

                      const borderClass = !memberIsOnline
                        ? styles.borderError
                        : memberIsReady
                          ? styles.borderPrimary
                          : styles.borderNone;
                      const dotClass = !memberIsOnline
                        ? styles.dotError
                        : !memberIsReady
                          ? styles.dotMuted
                          : styles.dotPrimary;

                      return (
                        <div
                          key={member.id}
                          className={`${styles.memberRow} ${borderClass}`}
                        >
                          <UserAvatar
                            name={member.name}
                            image={member.avatar}
                            size={24}
                            imageClassName={
                              memberIsOnline ? "" : styles.memberAvatarOffline
                            }
                            fallbackClassName={
                              memberIsOnline ? "" : styles.memberAvatarOffline
                            }
                          />
                          <div className={styles.memberDetails}>
                            <span className={styles.memberName}>
                              {getDisplayName(member.name, member.pizza_count)}{" "}
                              {member.id === userId && "(You)"}
                            </span>
                          </div>
                          <div
                            className={`${styles.statusDotSm} ${dotClass}`}
                            title={
                              memberIsReady
                                ? memberIsOnline
                                  ? "Ready to play"
                                  : "Playing while offline"
                                : "Not ready to play"
                            }
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
                <div className={styles.workspaceScroll}>
                  {/* Center Stage - Active Problem / Waiting Room */}
                  {matchState === "waiting" ? (
                    <div className={styles.waiting}>
                      <div className={styles.waitingIcon}>
                        <Users size={48} />
                      </div>
                      <h2 className={styles.waitingTitle}>
                        Waiting for Players
                      </h2>
                      <p className={styles.waitingText}>
                        The arena is being prepared. Review your strategy-the
                        match starts as soon as everyone is ready. At the
                        deadline, each team needs at least one ready member.
                      </p>
                      {readySecondsLeft !== null && readySecondsLeft > 0 && (
                        <div className={styles.readyCountdown}>
                          <Hourglass size={16} />
                          <span>
                            {opensInSeconds > 0
                              ? `Readiness opens in ${opensInSeconds}s`
                              : `Ready phase: ${readySecondsLeft}s remaining`}
                          </span>
                        </div>
                      )}
                      {!isSpectator && (
                        <button
                          onClick={handleReady}
                          disabled={
                            isReady ||
                            entering ||
                            opensInSeconds > 0 ||
                            readySecondsLeft === 0
                          }
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
                      )}
                      {entryError && <p role="alert">{entryError}</p>}
                    </div>
                  ) : (
                    <>
                      {!isSpectator &&
                        !isAdmitted &&
                        matchState === "active" && (
                          <div className={styles.entryNotice}>
                            <p>
                              Your team can keep playing while you are away.
                              Enter this match to participate.
                            </p>
                            <Button
                              variant="primary"
                              disabled={entering}
                              onClick={handleReady}
                            >
                              Enter match
                            </Button>
                            {entryError && <p role="alert">{entryError}</p>}
                          </div>
                        )}
                      <div className={styles.problemHead}>
                        <div className={styles.problemCount}>
                          <Target
                            className={`${styles.problemCountText} ${styles.icon16}`}
                            size={16}
                          />
                          <span className={styles.problemCountText}>
                            Problem{" "}
                            {Math.min(currentProblemIndex + 1, totalProblems)}{" "}
                            of {totalProblems}
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

                      {revealedProblems.length > 1 && (
                        <label className={styles.entryNotice}>
                          Review or sync a revealed problem
                          <select
                            value={activeProblem.problemId ?? ""}
                            onChange={(event) =>
                              setSelectedProblemId(event.target.value)
                            }
                          >
                            {revealedProblems.map((problem) => (
                              <option
                                key={problem.problemId}
                                value={problem.problemId}
                              >
                                {problem.problemId}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <p className={styles.problemTiming}>
                        {activeProblem.closedAt
                          ? "Problem closed, on-time submissions remain eligible during judging"
                          : activeProblem.deadlineAt
                            ? "Problem time remaining: " + problemTimeLeft
                            : "No problem timer"}
                      </p>

                      <div className={styles.problemCard}>
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
                            href={
                              getCodeforcesProblemUrl(
                                activeProblem.problemId || "",
                              ) || "#"
                            }
                            target="_blank"
                            rel="noreferrer"
                            className={styles.cfLink}
                          >
                            <ExternalLink size={16} />
                            Open in Codeforces
                          </a>
                          {!isSpectator && isAdmitted && (
                            <button
                              onClick={() =>
                                handleSync(activeProblem.problemId || "")
                              }
                              disabled={
                                !cfHandle ||
                                syncing ||
                                matchState !== "active" ||
                                syncCooldown > 0
                              }
                              className={styles.syncBtn}
                              title={
                                !cfHandle
                                  ? "Please link your Codeforces account to sync"
                                  : ""
                              }
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
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {matchState !== "waiting" && (
                  <div className={styles.runnerLauncher}>
                    <Button
                      ref={launcherRef}
                      disabled={!currentProblem}
                      onClick={() =>
                        workspace.open(
                          revealedProblems,
                          undefined,
                          currentProblem?.problemId,
                        )
                      }
                    >
                      {isSpectator || !isAdmitted ? (
                        <Eye size={16} aria-hidden="true" />
                      ) : (
                        <Code size={16} aria-hidden="true" />
                      )}
                      {isSpectator || !isAdmitted
                        ? "View Problem"
                        : "Open Code Runner"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Sidebar (Activity Log) */}
            <div className={styles.sideCol}>
              <div className={`${styles.panel} ${styles.panelStage}`}>
                <RoomActivityFeed
                  entries={activityFeed}
                  subtitle="Recent match activity"
                />
              </div>
            </div>
          </div>
        </div>
        {workspace.hasOpened && runnerProblem && (
          <ContestProblemWorkspace
            mode="blitz"
            roomId={roomId}
            userId={userId}
            problem={runnerProblem}
            problems={revealedProblems}
            currentProblem={currentProblem}
            readOnly={isSpectator || !isAdmitted}
            visible={workspace.isOpen}
            storageFailed={workspace.storageFailed}
            matchState={matchState}
            timeLeft={timeLeft}
            judgingDeadline={judgingDeadline}
            scores={(teams ?? []).map((team) => ({
              id: team._id,
              name: displayTeamName(team),
              score: scores[team._id] || 0,
            }))}
            activity={activityFeed}
            unread={activity.unread}
            onTabChange={activity.onTabChange}
            onSelect={workspace.select}
            onBack={workspace.close}
            onSync={handleSync}
            syncing={syncing}
            syncCooldown={syncCooldown}
            hasHandle={!!cfHandle}
            resultsPath={getContestRoomResultsPath(roomId, contest.format)}
          />
        )}
      </main>

      {/* Match Started Overlay Modal */}
      {showMatchStartedModal && !workspace.isOpen && (
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
      {matchState === "completed" &&
        !matchOverDismissed &&
        !workspace.isOpen && (
          <div className={styles.toast}>
            <div className={styles.toastCard}>
              <div className={styles.toastAccent}></div>
              <div className={styles.toastHeader}>
                <div className={styles.toastHeaderLeft}>
                  <Trophy className={styles.toastIcon} size={28} />
                  <h3 className={styles.toastTitle}>Match Over!</h3>
                </div>
                <button
                  type="button"
                  className={styles.toastClose}
                  aria-label="Dismiss match results"
                  onClick={() => setMatchOverDismissed(true)}
                >
                  <X size={18} />
                </button>
              </div>
              <p className={styles.toastText}>
                Final Scores: <br />
                <strong className={styles.toastScoreOwn}>
                  {teams?.[0] ? displayTeamName(teams[0]) : "Team Alpha"}:{" "}
                  {teams?.[0]
                    ? scores[teams[0]._id] || 0
                    : Object.values(scores)[0] || 0}
                </strong>
                <br />
                <strong className={styles.toastScoreOther}>
                  {teams?.[1] ? displayTeamName(teams[1]) : "Team Beta"}:{" "}
                  {teams?.[1]
                    ? scores[teams[1]._id] || 0
                    : Object.values(scores)[1] || 0}
                </strong>
              </p>
              <button
                onClick={() =>
                  router.push(getContestRoomResultsPath(roomId, contest.format))
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
