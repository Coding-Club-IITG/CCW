import { getContestById } from "@/lib/actions/contests";
import BlitzRoomClient from "@/lib/components/BlitzRoomClient";
import ArenaRoomClient from "@/lib/components/ArenaRoomClient";
import BracketRoomClient from "@/lib/components/BracketRoomClient";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import { createClient } from "redis";

export default async function ContestRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contest = await getContestById(id);

  if (!contest) {
    notFound();
  }

  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    return <div>Unauthorized</div>;
  }

  const userId = session.user.id;
  await dbConnect();

  // Find the active/waiting room for this user in this contest
  const room = await ContestRoom.findOne({
    contestId: contest._id,
    participants: userId
  }).lean();

  let teamId = null;
  let roomId = null;
  let roomName = null;

  if (room) {
    roomId = room._id.toString();
    roomName = room.name;
    const team = await ContestTeam.findOne({
      roomId: room._id,
      members: userId
    }).lean();
    if (team) {
      teamId = team._id.toString();
    }
  }

  if (contest.mode === "blitz") {
    // If we're strictly a blitz match, we need the room and team
    if (!room || !teamId) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center text-on-surface">
          <span className="material-symbols-outlined text-6xl text-error mb-4">error</span>
          <h1 className="text-2xl font-bold mb-2">No Room Found</h1>
          <p className="text-on-surface-variant">You have not been assigned to a match room for this contest yet.</p>
        </div>
      );
    }
    const teams = await ContestTeam.find({ roomId: room._id }).lean();
    const allMemberIds = teams.flatMap(t => t.members);
    const users = await User.find({ _id: { $in: allMemberIds } }, { name: 1 }).lean();
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    const populatedTeams = teams.map(t => ({
      _id: t._id.toString(),
      name: t.name,
      score: t.score || 0,
      members: t.members.map((mId: any) => {
        const u = userMap.get(mId.toString());
        return {
          id: mId.toString(),
          name: u ? u.name : "Unknown Player"
        };
      })
    }));

    const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
    const redis = createClient({ url: REDIS_URL });
    await redis.connect();
    const readyUserIds = await redis.sMembers(`room:${roomId}:ready_users`);
    await redis.disconnect();
    
    const cpUser = await CPUser.findOne({ userId }).lean();
    const userDoc = await User.findById(userId).lean();
    const cfHandle = cpUser?.cfHandle || userDoc?.codeforcesId || "dummy0";

    return <BlitzRoomClient contest={contest} roomId={roomId} roomName={roomName} teamId={teamId} userId={userId} cfHandle={cfHandle} teams={populatedTeams} initialReadyUserIds={readyUserIds} />;
  }

  if (contest.format === "bracket" || contest.mode === "knockout") {
    return <BracketRoomClient contest={contest} />;
  }

  if (contest.mode === "arena") {
    return <ArenaRoomClient contest={contest} />;
  }

  // Other formats are not fully implemented yet
  notFound();
}

