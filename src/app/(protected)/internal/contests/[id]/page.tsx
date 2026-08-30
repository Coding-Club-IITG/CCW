import { getContestById } from "@/lib/actions/contests";
import BlitzRoomClient from "@/components/contests/BlitzRoomClient";
import ArenaRoomClient from "@/components/contests/ArenaRoomClient";
import BracketRoomClient from "@/components/contests/BracketRoomClient";
import { notFound } from "next/navigation";
import { webEnv } from "@/lib/env/web";
import { userRateLimitsEnabled } from "@/lib/userRateLimit";
import {
  contestRoomStateSchema,
  parseContestRoomProblems,
} from "@/lib/contests/runtime";
import type {
  ContestRoomProblemDto,
  RoomActivityDto,
} from "@/lib/contests/dtos";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import { getRedis } from "@/lib/redis";
import { getBracketSnapshot } from "@/lib/contests/bracket";
import { isHead } from "@/lib/access/roles";
import { redirect } from "next/navigation";
import { CalendarX, CircleAlert, Hourglass } from "lucide-react";
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
  const contestResult = await getContestById(id);

  if (!contestResult.ok || !contestResult.data) {
    notFound();
  }
  const contest = contestResult.data;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    return <div>Unauthorized</div>;
  }

  const userRole = session.user.access as string | undefined;
  const admin = isHead(userRole);

  const userId = session.user.id;
  await dbConnect();

  // If matchRoomId is specified (bracket "Enter Room"), load that specific room
  const roomQuery = matchRoomId
    ? { _id: matchRoomId, contestId: contest._id }
    : { contestId: contest._id, participants: userId };

  // Find the active/waiting room for this user in this contest
  // Bracket format: show bracket viewer (unless entering a specific match room)
  if (
    (contest.format === "bracket" || contest.mode === "knockout") &&
    !matchRoomId
  ) {
    const bracketSnapshot = await getBracketSnapshot(contest._id.toString());
    const userTeams = await ContestTeam.find({
      contestId: contest._id,
      members: userId,
    })
      .select("_id")
      .lean();
    return (
      <BracketRoomClient
        contest={contest}
        initialSnapshot={bracketSnapshot}
        userId={userId}
        currentUserTeamIds={userTeams.map((team) => team._id.toString())}
      />
    );
  }

  let room = await ContestRoom.findOne(roomQuery).lean();
  let isSpectator = false;

  if (
    !room &&
    (contest.mode === "blitz" || contest.mode === "arena") &&
    contest.status === "active"
  ) {
    room = await ContestRoom.findOne({
      contestId: contest._id,
      status: { $in: ["waiting", "active"] },
    }).lean();
    isSpectator = Boolean(room);
  }

  let teamId = null;
  let roomId = null;
  let roomName = null;

  if (room) {
    if (room.status === "ended") {
      // For bracket, ended rooms go back to bracket viewer
      if (
        matchRoomId &&
        (contest.format === "bracket" || contest.mode === "knockout")
      ) {
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
    const team = await ContestTeam.findOne({
      roomId: room._id,
      members: userId,
    }).lean();
    if (team) {
      teamId = team._id.toString();
    }
  }

  if (contest.mode === "blitz" || contest.mode === "arena") {
    if (!room || (!teamId && !isSpectator)) {
      if (contest.status === "completed") {
        // Non-participant or unassigned user: try to redirect to any room
        const anyRoom = await ContestRoom.findOne({
          contestId: contest._id,
        }).lean();
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
            <meta httpEquiv="refresh" content="5" />
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
      score: t.score || 0,
      members: t.members.map((memberId) => {
        const u = userMap.get(memberId.toString());
        const cp = cpUserMap.get(memberId.toString());
        return {
          id: memberId.toString(),
          name: u?.name || "Unknown Player",
          pizza_count: u?.pizza_count || 0,
          handle: cp?.cfHandle || u?.name || "Unknown",
          avatar:
            u?.image ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(u?.name || "U")}&background=random`,
        };
      }),
    }));

    const redis = await getRedis();
    const ContestRoomActivity = (await import("@/models/ContestRoomActivity"))
      .default;
    const initialActivityRecords = await ContestRoomActivity.find({
      roomId: room._id,
    })
      .sort({ createdAt: 1 })
      .limit(500)
      .lean();
    const initialActivityFeed: RoomActivityDto[] = initialActivityRecords.map(
      (activity, index) => ({
        id: activity.createdAt.getTime() + index,
        icon: activity.icon,
        text: activity.text,
        color: activity.color,
        timestamp: activity.createdAt.getTime(),
      }),
    );
    const readyUserIds = await redis.sMembers(`room:${roomId}:ready_users`);

    // Check online presence for all members
    const initialOnlineUserIds = [userId];
    const presenceKeysToFetch: string[] = [];
    const membersToFetch: string[] = [];

    for (const mId of allMemberIds) {
      const idStr = mId.toString();
      if (idStr !== userId) {
        presenceKeysToFetch.push(`room:${roomId}:presence:${idStr}`);
        membersToFetch.push(idStr);
      }
    }

    if (presenceKeysToFetch.length > 0) {
      const presenceResults = await redis.mGet(presenceKeysToFetch);
      for (let i = 0; i < presenceResults.length; i++) {
        if (presenceResults[i]) {
          initialOnlineUserIds.push(membersToFetch[i]);
        }
      }
    }

    // Fetch current state from Redis
    const stateObj = contestRoomStateSchema.parse(
      await redis.hGetAll(`room:${roomId}:state`),
    );
    const rawStatus = stateObj.status || room.status;
    const status =
      rawStatus === "active"
        ? "active"
        : rawStatus === "ended"
          ? "completed"
          : "waiting";

    let initialProblems: ContestRoomProblemDto[] = [];
    let initialScores: Record<string, number> = {};
    let initialLocks: Record<string, string> = {};

    if (status === "active" || status === "completed") {
      const problemsRaw = await redis.lRange(`room:${roomId}:problems`, 0, -1);
      initialProblems = parseContestRoomProblems(problemsRaw);

      for (const t of populatedTeams) {
        const s = await redis.zScore(`room:${roomId}:scores`, t._id);
        initialScores[t._id] = s ? parseFloat(s.toString()) : 0;
      }

      if (contest.mode === "arena") {
        initialLocks = await redis.hGetAll(`room:${roomId}:locks`);
      }
    }

    const cpUser = cpUserMap.get(userId);
    const userDoc = userMap.get(userId);
    const cfHandle = cpUser?.cfHandle || userDoc?.codeforcesId || "dummy0";

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
          from={from}
          syncCooldownSeconds={syncCooldown}
          initialActivityFeed={initialActivityFeed}
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
          from={from}
          syncCooldownSeconds={syncCooldown}
          initialActivityFeed={initialActivityFeed}
          isSpectator={isSpectator}
        />
      );
    }
  }

  // Other formats are not fully implemented yet
  notFound();
}
