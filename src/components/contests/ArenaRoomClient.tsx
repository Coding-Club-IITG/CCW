"use client";

import {
  CircleCheck,
  Code,
  ExternalLink,
  Hourglass,
  Lock,
  RefreshCw,
  Timer,
  Trophy,
  Users,
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

import styles from "./ArenaRoomClient.module.scss";

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
  initialLocks?: Record<string, string>;
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
  const [problems, setProblems] =
    useState<ContestRoomProblemDto[]>(initialProblems);
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [locks, setLocks] = useState<Record<string, string>>(initialLocks);

  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(
    new Set(initialOnlineUserIds || [userId]),
  ); // Track online users
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

  const [syncingMap, setSyncingMap] = useState<Record<string, boolean>>({});
  const {
    cooldown: syncCooldown,
    hold: holdSync,
    begin: beginSync,
  } = useSyncCooldown(roomId, userId, syncCooldownSeconds);

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
  const runnerProblem = problems.find(
    (problem) => problem.problemId === workspace.problemId,
  );

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
        setMatchState(nextStatus);
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
        if (payload.problems) setProblems(payload.problems);
        if (payload.scores) setScores(payload.scores);
        if (payload.locks) setLocks(payload.locks);
        if (payload.activityLogs) activity.snapshot(payload.activityLogs);
        break;
      case "room.end":
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
        if (payload.problemId) {
          const problemId = payload.problemId;

          setSyncingMap((prev) => ({ ...prev, [problemId]: false }));
        }
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
      locks[problemId] ||
      !isAdmitted ||
      isSpectator ||
      syncingMap[problemId] ||
      matchState !== "active" ||
      syncCooldown > 0
    )
      return;

    holdSync();
    setSyncingMap((previous) => ({ ...previous, [problemId]: true }));

    try {
      const res = await fetch("/api/contests/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          teamId,
          cfHandle: cfHandle || "", // Use real handle if available
          problemId: problemId,
        }),
      });

      const syncRes = await readAppResult(res);

      if (!syncRes.ok) {
        setSyncingMap((prev) => ({ ...prev, [problemId]: false }));
        addActivity(
          "error",
          `Sync failed: ${syncRes.error.message || "Failed to initiate sync"}`,
          "text-error",
        );
      }
    } catch {
      setSyncingMap((previous) => ({ ...previous, [problemId]: false }));
      addActivity(
        "error",
        "Sync failed: connection unavailable. Try again.",
        "text-error",
      );
    } finally {
      beginSync();
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.bgPattern} aria-hidden="true"></div>

      {/* Main Content Canvas */}
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
              {teams?.map((t, idx) => (
                <div key={t._id} className={styles.teamScoreGroup}>
                  <span
                    className={
                      t._id === teamId ? styles.teamNameActive : styles.teamName
                    }
                  >
                    {displayTeamName(t)}
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

            {/* Center Stage - Problem Grid */}
            <div className={styles.centerCol}>
              <div className={`${styles.panel} ${styles.panelStage}`}>
                <div className={styles.workspaceWrapper}>
                  <div className={styles.workspaceScroll}>
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
                        {entryError && <p role="alert">{entryError}</p>}
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
                        <div className={styles.gridHead}>
                          <h2 className={styles.gridHeadTitle}>Problem Grid</h2>
                        </div>

                        <div className={styles.problemGrid}>
                          {problems.map((prob, idx) => {
                            const lockVal = locks[prob.problemId];
                            const isClaimed = !!lockVal;
                            let claimedByMe = false;
                            let claimedByWhoName = "Unknown";

                            if (isClaimed) {
                              const [cTeamId] = lockVal.split("|");

                              claimedByMe = cTeamId === teamId;

                              const t = teams?.find((t) => t._id === cTeamId);

                              claimedByWhoName = t
                                ? displayTeamName(t)
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
                                key={`${prob.problemId}-${idx}`}
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
                                    {prob.problemId
                                      ? `${prob.problemId} - `
                                      : ""}
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
                                      href={
                                        getCodeforcesProblemUrl(
                                          prob.problemId,
                                        ) || "#"
                                      }
                                      target="_blank"
                                      rel="noreferrer"
                                      className={styles.cfIconBtn}
                                      title="Open in Codeforces"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink
                                        className={styles.icon16}
                                        size={16}
                                      />
                                    </a>
                                    {!isSpectator && isAdmitted && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSync(prob.problemId);
                                        }}
                                        disabled={
                                          !cfHandle ||
                                          isClaimed ||
                                          isSyncing ||
                                          matchState !== "active" ||
                                          syncCooldown > 0
                                        }
                                        className={styles.syncMini}
                                        title={
                                          !cfHandle
                                            ? "Please link your Codeforces account to sync"
                                            : ""
                                        }
                                      >
                                        {isClaimed ? (
                                          <Lock
                                            className={styles.icon14}
                                            size={14}
                                          />
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
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  {matchState !== "waiting" && (
                    <div className={styles.runnerLauncher}>
                      <Button
                        ref={launcherRef}
                        disabled={!problems.length}
                        onClick={() => workspace.open(problems, locks)}
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
            </div>

            {/* Right Sidebar (Activity Log) */}
            <div className={styles.sideCol}>
              <div className={`${styles.panel} ${styles.panelStage}`}>
                <RoomActivityFeed entries={activityFeed} />
              </div>
            </div>
          </div>
        </div>
        {workspace.hasOpened && runnerProblem && (
          <ContestProblemWorkspace
            mode="arena"
            roomId={roomId}
            userId={userId}
            problem={runnerProblem}
            problems={problems}
            claims={Object.fromEntries(
              Object.entries(locks).map(([id, lock]) => [
                id,
                "Claimed by " +
                  displayTeamName(
                    teams?.find((team) => team._id === lock.split("|")[0]),
                  ),
              ]),
            )}
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
            syncing={!!syncingMap[runnerProblem.problemId]}
            syncCooldown={syncCooldown}
            hasHandle={!!cfHandle}
            resultsPath={getContestRoomResultsPath(roomId, contest.format)}
          />
        )}
      </main>

      {/* Match Over Overlay Modal */}
      {matchState === "completed" && !workspace.isOpen && (
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
                    {displayTeamName(t)}
                  </strong>
                  <span>{scores[t._id] || 0} pts</span>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                router.push(getContestRoomResultsPath(roomId, contest.format))
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
