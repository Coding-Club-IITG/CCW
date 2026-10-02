import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarX, CircleAlert, Hourglass } from "lucide-react";

import { CONTEST_TIMING } from "@/lib/constants";

import { getContestById } from "@/lib/actions/contests";
import { objectIdStringSchema } from "@/lib/api/schemas/contestRoute";
import { webEnv } from "@/lib/env/web";
import { userRateLimitsEnabled } from "@/lib/users/rateLimit";
import { roomGameplaySnapshot } from "@/lib/contests/roomSnapshot";
import type {
  ContestRoomProblemDto,
  RoomActivityDto,
} from "@/lib/contests/dtos";
import { normalizeAvatar } from "@/lib/users/identity";
import { auth } from "@/lib/auth/server";
import { getRedis } from "@/lib/db/redis";
import { getBracketSnapshot } from "@/lib/contests/bracket";
import { isHead } from "@/lib/access/roles";
import { authorizeContestView, authorizeRoomView } from "@/lib/access/contests";
import { getRoomOnlineUserIds } from "@/lib/contests/presence";

import ContestProblemSet from "@/models/ContestProblemSet";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import User from "@/models/User";
import CPUser from "@/models/CPUser";

import BlitzRoomClient from "@/components/contests/BlitzRoomClient";
import ArenaRoomClient from "@/components/contests/ArenaRoomClient";
import BracketRoomClient from "@/components/contests/BracketRoomClient";

import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

export default async function ContestRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; matchRoomId?: string }>;
}) {
  const { id } = await params;
  const { from, matchRoomId } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  if (
    matchRoomId !== undefined &&
    !objectIdStringSchema.safeParse(matchRoomId).success
  )
    notFound();

  const viewAccess = await authorizeContestView(id, session.user);

  if (!viewAccess.ok) notFound();

  const contestResult = await getContestById(id);

  if (!contestResult.ok) notFound();

  const contest = contestResult.data;

  if (viewAccess.data.contest.cancellationReason)
    return (
      <div className={styles.stateWrap}>
        <CalendarX
          className={`${styles.stateIcon} ${styles.iconError}`}
          size={60}
        />
        <h1 className={styles.stateTitle}>Contest Cancelled</h1>
        <p className={styles.stateText}>
          {viewAccess.data.contest.cancellationReason}
        </p>
      </div>
    );

  const admin = isHead(session.user.access);
  const userId = session.user.id;
  let isSpectator = false;

  // Bracket format: show bracket viewer (unless entering a specific match room)
  if (contest.format === "bracket" && !matchRoomId) {
    const bracketSnapshot = await getBracketSnapshot(contest._id.toString());
    const userTeams = await ContestTeam.find({
      contestId: contest._id,
      members: userId,
    }).lean();
    const userTeamIds = userTeams.map((t) => t._id.toString());

    return (
      <BracketRoomClient
        contest={contest}
        initialSnapshot={bracketSnapshot}
        userId={userId}
        currentUserTeamIds={userTeamIds}
        canSpectate={viewAccess.data.canSpectate}
        isAdmin={admin}
      />
    );
  }

  const roomQuery = matchRoomId
    ? { _id: matchRoomId, contestId: contest._id }
    : { contestId: contest._id, participants: userId };

  let room = await ContestRoom.findOne(roomQuery).lean();

  if (!room && !matchRoomId && viewAccess.data.canSpectate) {
    room = await ContestRoom.findOne({ contestId: contest._id }).lean();
  }

  let teamId = null;
  let roomId = null;
  let roomName = null;

  if (matchRoomId && !room) notFound();

  if (room) {
    const roomAccess = await authorizeRoomView(
      String(room._id),
      session.user,
      id,
    );

    if (!roomAccess.ok) notFound();

    isSpectator = roomAccess.data.isSpectator;
    teamId = roomAccess.data.teamId;

    if (room.status === "ended") {
      // For bracket, ended rooms go back to bracket viewer
      if (matchRoomId && contest.format === "bracket") {
        const { redirect } = await import("next/navigation");

        redirect(`/internal/contests/${id}`);
      }

      const { redirect } = await import("next/navigation");

      redirect(
        `/internal/contests/rooms/${room._id.toString()}/result${from ? `?from=${from}` : ""}`,
      );
    }

    roomId = room._id.toString();
    roomName = room.name;
  }

  if (contest.mode === "blitz" || contest.mode === "arena") {
    if (!room || (!teamId && !isSpectator)) {
      if (contest.status === "completed") {
        // Non-participant or unassigned user: try to redirect to any room
        const anyRoom = viewAccess.data.canSpectate
          ? await ContestRoom.findOne({
              contestId: contest._id,
            }).lean()
          : null;

        if (anyRoom) {
          redirect(`/internal/contests/rooms/${anyRoom._id.toString()}/result`);
        }

        // No rooms at all - contest was cancelled before provisioning
        return (
          <div className={styles.stateWrap}>
            <CalendarX
              className={`${styles.stateIcon} ${styles.iconError}`}
              size={60}
            />
            <h1 className={styles.stateTitle}>Contest Cancelled</h1>
            <p className={styles.stateText}>
              This contest was cancelled (likely due to not enough players).
            </p>
          </div>
        );
      } else if (
        ["draft", "registration", "provisioning"].includes(contest.status)
      ) {
        return (
          <div className={styles.stateWrap}>
            <Hourglass
              className={`${styles.stateIcon} ${styles.iconPrimary} ${styles.spin}`}
              size={60}
            />
            <h1 className={styles.stateTitle}>Match is Preparing</h1>
            <p className={styles.stateText}>
              The rooms are currently being provisioned. Please wait...
            </p>
            <meta
              httpEquiv="refresh"
              content={String(CONTEST_TIMING.preparationRefreshSeconds)}
            />
          </div>
        );
      } else {
        return (
          <div className={styles.stateWrap}>
            <CircleAlert
              className={`${styles.stateIcon} ${styles.iconError}`}
              size={60}
            />
            <h1 className={styles.stateTitle}>No Room Found</h1>
            <p className={styles.stateText}>
              You have not been assigned to a match room for this contest yet.
            </p>
          </div>
        );
      }
    }

    const teams = await ContestTeam.find({ roomId: room._id }).lean();
    const allMemberIds = teams.flatMap((t) => t.members);
    const users = await User.find(
      { _id: { $in: allMemberIds } },
      { name: 1, image: 1, pizza_count: 1 },
    ).lean();
    const cpUsers = await CPUser.find({ userId: { $in: allMemberIds } }).lean();

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    const cpUserMap = new Map(cpUsers.map((cp) => [cp.userId.toString(), cp]));

    const populatedTeams = teams.map((t) => ({
      _id: t._id.toString(),
      name: t.name,
      score: Math.max(t.score || 0, 0),
      members: t.members.map((memberId) => {
        const u = userMap.get(memberId.toString());
        const cp = cpUserMap.get(memberId.toString());

        return {
          id: memberId.toString(),
          name: u?.name || "Unknown Player",
          pizza_count: u?.pizza_count || 0,
          handle: cp?.cfHandle || u?.name || "Unknown",
          avatar: normalizeAvatar(u?.image),
        };
      }),
    }));

    const redis = await getRedis();
    const readyUserIds = room.readyUserIds.map(String);

    const initialOnlineUserIds = await getRoomOnlineUserIds(roomId!);

    const problemSet = await ContestProblemSet.findOne({ roomId }).lean();
    const snapshot = roomGameplaySnapshot(
      room,
      contest.mode,
      problemSet?.problems ?? [],
    );
    const stateObj = snapshot.state;
    const rawStatus = stateObj.status || room.status;
    const status =
      rawStatus === "active"
        ? "active"
        : rawStatus === "completed" || rawStatus === "ended"
          ? "completed"
          : "waiting";

    let initialProblems: ContestRoomProblemDto[] = [];
    let initialScores: Record<string, number> = {};
    let initialLocks: Record<string, string> = {};
    let initialActivityFeed: RoomActivityDto[] = [];

    if (status === "active" || status === "completed") {
      initialProblems = snapshot.problems;
      initialScores = snapshot.scores;
      initialLocks = snapshot.locks;

      const activityLogsRaw = await redis.lRange(
        `room:${roomId}:activity_logs`,
        0,
        -1,
      );

      initialActivityFeed = activityLogsRaw.map((l) => JSON.parse(l));
    }

    const cpUser = cpUserMap.get(userId);
    const userDoc = userMap.get(userId);
    const cfHandle = cpUser?.cfHandle || userDoc?.codeforcesId || "";

    const syncCooldown = userRateLimitsEnabled ? webEnv.SYNC_COOLDOWN : 0;

    if (contest.mode === "blitz") {
      return (
        <BlitzRoomClient
          contest={contest}
          roomId={roomId!}
          roomName={roomName!}
          teamId={teamId}
          userId={userId}
          cfHandle={cfHandle}
          teams={populatedTeams}
          initialReadyUserIds={readyUserIds}
          initialOnlineUserIds={initialOnlineUserIds}
          initialMatchState={status}
          initialProblems={initialProblems}
          initialScores={initialScores}
          initialProblemIndex={
            stateObj?.currentProblem
              ? parseInt(stateObj.currentProblem)
              : room.currentProblemIndex || 0
          }
          initialStartTime={
            stateObj?.startTime ? parseInt(stateObj.startTime) : undefined
          }
          initialTimeLimit={
            stateObj?.timeLimit ? parseInt(stateObj.timeLimit) : undefined
          }
          initialJudgingDeadline={room.judgingDeadline?.getTime()}
          initialReadyDeadline={room.readyDeadline?.getTime()}
          initialReadyOpensAt={room.readyOpensAt?.getTime()}
          initialAdmittedUserIds={room.admissions.map((admission) =>
            String(admission.userId),
          )}
          initialActivityFeed={initialActivityFeed}
          from={from}
          syncCooldownSeconds={syncCooldown}
          isSpectator={isSpectator}
        />
      );
    } else if (contest.mode === "arena") {
      return (
        <ArenaRoomClient
          contest={contest}
          roomId={roomId!}
          roomName={roomName!}
          teamId={teamId}
          userId={userId}
          cfHandle={cfHandle}
          teams={populatedTeams}
          initialReadyUserIds={readyUserIds}
          initialOnlineUserIds={initialOnlineUserIds}
          initialMatchState={status}
          initialProblems={initialProblems}
          initialScores={initialScores}
          initialLocks={initialLocks}
          initialStartTime={
            stateObj?.startTime ? parseInt(stateObj.startTime) : undefined
          }
          initialTimeLimit={
            stateObj?.timeLimit ? parseInt(stateObj.timeLimit) : undefined
          }
          initialJudgingDeadline={room.judgingDeadline?.getTime()}
          initialReadyDeadline={room.readyDeadline?.getTime()}
          initialReadyOpensAt={room.readyOpensAt?.getTime()}
          initialAdmittedUserIds={room.admissions.map((admission) =>
            String(admission.userId),
          )}
          initialActivityFeed={initialActivityFeed}
          from={from}
          syncCooldownSeconds={syncCooldown}
          isSpectator={isSpectator}
        />
      );
    }
  }

  // Other formats are not fully implemented yet
  notFound();
}
