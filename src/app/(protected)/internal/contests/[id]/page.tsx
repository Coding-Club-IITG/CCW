import { getContestById } from "@/lib/actions/contests";
import BlitzRoomClient from "@/components/contests/BlitzRoomClient";
import ArenaRoomClient from "@/components/contests/ArenaRoomClient";
import BracketRoomClient from "@/components/contests/BracketRoomClient";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import { getRedis } from "@/lib/redis";
import { getBracketSnapshot } from "@/lib/bracket";
import { isAdmin } from "@/lib/roles";
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
  const contest = await getContestById(id);

  if (!contest) {
    notFound();
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    return <div>Unauthorized</div>;
  }

  const userRole = session.user.role as string | undefined;
  const admin = isAdmin(userRole);

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
    const userTeam = await ContestTeam.findOne({
      contestId: contest._id,
      members: userId,
    }).lean();
    return (
      <BracketRoomClient
        contest={contest}
        initialSnapshot={bracketSnapshot}
        userId={userId}
        currentUserTeamId={userTeam ? userTeam._id.toString() : null}
      />
    );
  }

  const room = await ContestRoom.findOne(roomQuery).lean();

  let teamId = null;
  let roomId = null;
  let roomName = null;

  if (room) {
    if (room.status === "ended" || room.status === "completed") {
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
    if (!room || !teamId) {
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
      members: t.members.map((mId: any) => {
        const u = userMap.get(mId.toString());
        const cp = cpUserMap.get(mId.toString());
        return {
          id: mId.toString(),
          name: u ? u.name : "Unknown Player",
          pizza_count: u?.pizza_count || 0,
          handle: cp?.cfHandle || u?.name || "Unknown",
          avatar:
            u?.image ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(u?.name || "U")}&background=random`,
        };
      }),
    }));

    const redis = await getRedis();
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
    const stateObj = await redis.hGetAll(`room:${roomId}:state`);
    const status = (stateObj?.status as any) || room.status || "waiting";

    let initialProblems = [];
    let initialScores: Record<string, number> = {};
    let initialLocks: Record<string, string> = {};

    if (status === "active" || status === "completed") {
      const problemsRaw = await redis.lRange(`room:${roomId}:problems`, 0, -1);
      initialProblems = problemsRaw
        .map((p) => {
          try {
            return JSON.parse(p);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);

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

    const syncCooldown = parseInt(
      process.env.NEXT_PUBLIC_SYNC_COOLDOWN ||
        process.env.SYNC_COOLDOWN ||
        "60",
      10,
    );

    if (contest.mode === "blitz") {
      return (
        <BlitzRoomClient
          contest={contest}
          roomId={roomId!}
          roomName={roomName}
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
        />
      );
    } else if (contest.mode === "arena") {
      return (
        <ArenaRoomClient
          contest={contest}
          roomId={roomId!}
          roomName={roomName}
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
        />
      );
    }
  }

  // Other formats are not fully implemented yet
  notFound();
}
