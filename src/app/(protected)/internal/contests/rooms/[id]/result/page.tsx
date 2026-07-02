import PostMatchResultClient from "@/lib/components/PostMatchResultClient";
import { getContestById } from "@/lib/actions/contests";
import { notFound } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestSubmission from "@/models/ContestSubmission";
import CPUser from "@/models/CPUser";

export default async function PostMatchResultPage({ 
  params,
  searchParams,
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ from?: string }>
}) {
  const unwrappedParams = await params;
  const unwrappedSearch = await searchParams;
  
  await dbConnect();
  const roomId = unwrappedParams.id;
  
  let room = await ContestRoom.findById(roomId).lean();
  if (!room) {
    notFound();
  }
  
  // 1. Retry loop to wait for reconciliation worker (fixes race condition)
  let retries = 0;
  while (room && room.status !== "ended" && retries < 10) {
    await new Promise(r => setTimeout(r, 500));
    room = await ContestRoom.findById(roomId).lean();
    retries++;
  }

  const contest = await getContestById(room.contestId.toString());
  if (!contest) {
    notFound();
  }
  
  // 2. Fetch all match data
  const teams = await ContestTeam.find({ roomId }).lean();
  const problemSet = await ContestProblemSet.findOne({ roomId }).lean();
  const submissions = await ContestSubmission.find({ roomId, verdict: "OK" }).lean();
  
  const userIds = teams.flatMap(t => t.members || []);
  
  const User = (await import("@/models/User")).default;
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const cpUsers = await CPUser.find({ userId: { $in: userIds } }).lean();
  
  // 3. Process match data
  const processedTeams = teams.map(t => {
    return {
      id: t._id.toString(),
      name: t.name || "Unknown Team",
      score: t.score || 0,
      members: users.filter(u => t.members?.some((m: any) => m.toString() === u._id.toString())).map(u => {
        const cpUser = cpUsers.find(cp => cp.userId?.toString() === u._id.toString());
        return {
          id: u._id.toString(),
          name: u.name || "Unknown User",
          handle: cpUser?.cfHandle || u.name || "Unknown User",
          avatar: u.image || cpUser?.cfAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || "U")}&background=random`
        };
      })
    };
  });
  
  processedTeams.sort((a, b) => b.score - a.score);

  let processedProblems: any[] = [];
  if (problemSet && problemSet.problems) {
    processedProblems = problemSet.problems.map((p: any) => {
      const subsForProb = submissions.filter(s => s.problemId === p.problemId);
      subsForProb.sort((a, b) => (a.solveMs || Infinity) - (b.solveMs || Infinity));
      const firstSub = subsForProb[0];
      
      let solverDetails = null;
      if (firstSub) {
        const solverTeam = processedTeams.find(t => t.id === firstSub.teamId?.toString());
        const solverUser = solverTeam?.members.find(m => m.id === firstSub.userId?.toString());
        if (solverTeam && solverUser) {
          solverDetails = {
            userId: solverUser.id,
            userName: solverUser.handle || solverUser.name,
            userAvatar: solverUser.avatar,
            teamId: solverTeam.id,
            teamName: solverTeam.name,
            solveMs: firstSub.solveMs || 0
          };
        }
      }
      
      return {
        id: p.problemId,
        name: `${p.problemId} - ${p.name}`,
        rating: p.rating || 0,
        points: p.points || 100,
        solved: !!solverDetails,
        solver: solverDetails
      };
    });
  }

  const userScores: Record<string, number> = {};
  for (const prob of processedProblems) {
    if (prob.solved && prob.solver) {
      userScores[prob.solver.userId] = (userScores[prob.solver.userId] || 0) + prob.points;
    }
  }
  
  let mvp = null;
  let maxUserScore = 0;
  for (const [userId, score] of Object.entries(userScores)) {
    if (score > maxUserScore) {
      maxUserScore = score;
      mvp = userId;
    }
  }
  
  let mvpDetails = null;
  if (mvp) {
    const mvpUser = users.find(u => u._id.toString() === mvp);
    const mvpTeam = processedTeams.find(t => t.members.some(m => m.id === mvp));
    if (mvpUser && mvpTeam) {
      const cpUser = cpUsers.find(cp => cp.userId?.toString() === mvp);
      mvpDetails = {
        userId: mvpUser._id.toString(),
        name: cpUser?.cfHandle || mvpUser.name || "Unknown User",
        avatar: mvpUser.image || cpUser?.cfAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(mvpUser.name || "U")}&background=random`,
        teamName: mvpTeam.name,
        contribution: maxUserScore
      };
    }
  }
  
  let durationStr = "0m 0s";
  if (contest.startTime && contest.endTime) {
    const diffMs = new Date(contest.endTime).getTime() - new Date(contest.startTime).getTime();
    if (diffMs > 0) {
      const totalSeconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      durationStr = `${minutes}m ${seconds}s`;
    }
  } else if (submissions.length > 0) {
    const maxSolveMs = Math.max(...submissions.map(s => s.solveMs || 0));
    if (maxSolveMs > 0) {
      const totalSeconds = Math.floor(maxSolveMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      durationStr = `${minutes}m ${seconds}s`;
    }
  }

  const matchData = {
    roomId: roomId,
    roomType: contest.roomFormat === "arena" ? "Arena Format" : "Blitz Format",
    duration: durationStr,
    teams: processedTeams,
    problems: processedProblems,
    mvp: mvpDetails,
    isKnockout: contest.format === "bracket",
  };
  
  return <PostMatchResultClient matchData={matchData} from={unwrappedSearch?.from} />;
}
