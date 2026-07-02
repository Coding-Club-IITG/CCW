import { getContestById } from "@/lib/actions/contests";
import BlitzRoomClient from "@/lib/components/BlitzRoomClient";
import ArenaRoomClient from "@/lib/components/ArenaRoomClient";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import { createClient } from "redis";

export default async function MatchRoomPage({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ from?: string }>
}) {
  const { id } = await params;
  const { from } = await searchParams;

  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return <div>Unauthorized</div>;
  }

  const userId = session.user.id;
  await dbConnect();

  // Find the room
  const room = await ContestRoom.findById(id).lean();
  
  if (!room) {
    notFound();
  }
  
  if (!room.participants || !room.participants.includes(userId)) {
     return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center text-on-surface">
          <span className="material-symbols-outlined text-6xl text-error mb-4">lock</span>
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-on-surface-variant">You are not a participant in this room.</p>
        </div>
      );
  }

  const contest = await getContestById(room.contestId.toString());
  if (!contest) {
    notFound();
  }

  let teamId = null;
  const roomId = room._id.toString();
  const roomName = room.name;

  if (room.status === "ended" || room.status === "completed") {
    const { redirect } = await import("next/navigation");
    redirect(`/internal/contests/rooms/${roomId}/result${from ? `?from=${from}` : ''}`);
  }

  const team = await ContestTeam.findOne({
    roomId: room._id,
    members: userId
  }).lean();
  
  if (team) {
    teamId = team._id.toString();
  }

  if (!teamId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-on-surface">
        <span className="material-symbols-outlined text-6xl text-error mb-4">error</span>
        <h1 className="text-2xl font-bold mb-2">No Team Found</h1>
        <p className="text-on-surface-variant">You are not assigned to any team in this room.</p>
      </div>
    );
  }

  const teams = await ContestTeam.find({ roomId: room._id }).lean();
  const allMemberIds = teams.flatMap(t => t.members);
  const users = await User.find({ _id: { $in: allMemberIds } }, { name: 1, image: 1 }).lean();
  const cpUsers = await CPUser.find({ userId: { $in: allMemberIds } }).lean();
  
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  const cpUserMap = new Map(cpUsers.map(cp => [cp.userId.toString(), cp]));

  const populatedTeams = teams.map(t => ({
    _id: t._id.toString(),
    name: t.name,
    score: t.score || 0,
    members: t.members.map((mId: any) => {
      const u = userMap.get(mId.toString());
      const cp = cpUserMap.get(mId.toString());
      return {
        id: mId.toString(),
        name: u ? u.name : "Unknown Player",
        handle: cp?.cfHandle || u?.name || "Unknown",
        avatar: u?.image || cp?.cfAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u ? u.name : "Unknown")}&background=random`
      };
    })
  }));

  const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  const readyUserIds = await redis.sMembers(`room:${roomId}:ready_users`);
  
  const stateObj = await redis.hGetAll(`room:${roomId}:state`);
  const status = (stateObj?.status as any) || room.status || "waiting";
  
  let initialProblems = [];
  let initialScores: Record<string, number> = {};
  let initialLocks: Record<string, string> = {};
  
  if (status === "active" || status === "completed") {
    const problemsRaw = await redis.lRange(`room:${roomId}:problems`, 0, -1);
    initialProblems = problemsRaw.map(p => JSON.parse(p));
    
    for (const t of populatedTeams) {
      const s = await redis.zScore(`room:${roomId}:scores`, t._id);
      initialScores[t._id] = s ? parseFloat(s.toString()) : 0;
    }

    const m = contest.mode || "blitz";
    if (m === "arena") {
      initialLocks = await redis.hGetAll(`room:${roomId}:locks`);
    }
  }
  
  await redis.disconnect();
  
  const cpUser = cpUserMap.get(userId);
  const userDoc = userMap.get(userId);
  const cfHandle = cpUser?.cfHandle || userDoc?.codeforcesId || "dummy0";

  const mode = contest.mode || "blitz";

  if (mode === "blitz" || mode === "knockout" || mode === "bracket") {
    // Note: bracket uses blitz mode matches
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
        initialMatchState={status}
        initialProblems={initialProblems}
        initialScores={initialScores}
        initialProblemIndex={room.currentProblemIndex || 0}
      />
    );
  } else if (mode === "arena") {
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
        initialMatchState={status}
        initialProblems={initialProblems}
        initialScores={initialScores}
        initialLocks={initialLocks}
        initialStartTime={stateObj?.startTime ? parseInt(stateObj.startTime) : undefined}
        initialTimeLimit={stateObj?.timeLimit ? parseInt(stateObj.timeLimit) : undefined}
      />
    );
  }

  return <div>Format {mode} not fully implemented yet</div>;
}
