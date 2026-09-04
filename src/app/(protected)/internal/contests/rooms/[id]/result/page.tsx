import PostMatchResultClient from "@/components/contests/PostMatchResultClient";
import { getContestById } from "@/lib/actions/contests";
import { notFound } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestSubmission from "@/models/ContestSubmission";
import CPUser from "@/models/CPUser";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isHead } from "@/lib/access/roles";
import { normalizeAvatar } from "@/lib/utils";
import { redirect } from "next/navigation";

export default async function PostMatchResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const unwrappedParams = await params;
  const unwrappedSearch = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const userRole = session?.user?.access as string | undefined;
  const admin = isHead(userRole);

  const currentUserId = session?.user?.id || "";

  await dbConnect();
  const roomId = unwrappedParams.id;

  let room = await ContestRoom.findById(roomId).lean();
  if (!room) {
    notFound();
  }

  const isProcessing = room.status !== "ended";

  const contestResult = await getContestById(room.contestId.toString());
  if (!contestResult.ok || !contestResult.data) {
    notFound();
  }
  const contest = contestResult.data;

  // 2. Fetch all match data
  const teams = await ContestTeam.find({ roomId }).lean();
  const problemSet = await ContestProblemSet.findOne({ roomId }).lean();
  const submissions = await ContestSubmission.find({
    roomId,
    verdict: "OK",
  }).lean();

  const userIds = teams.flatMap((t) => t.members || []);

  const User = (await import("@/models/User")).default;
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const cpUsers = await CPUser.find({ userId: { $in: userIds } }).lean();

  // 3. Process problems first to calculate user contributions
  let processedProblems: any[] = [];
  if (problemSet && problemSet.problems) {
    processedProblems = problemSet.problems.map((p: any) => {
      const subsForProb = submissions.filter(
        (s) => s.problemId === p.problemId,
      );
      subsForProb.sort(
        (a, b) => (a.solveMs || Infinity) - (b.solveMs || Infinity),
      );
      const firstSub = subsForProb[0];

      let solverDetails = null;
      if (firstSub) {
        const solverTeamId = firstSub.teamId?.toString();
        const solverUserId = firstSub.userId?.toString();
        const u = users.find((u) => u._id.toString() === solverUserId);
        const cp = cpUsers.find((cp) => cp.userId?.toString() === solverUserId);
        const t = teams.find((t) => t._id.toString() === solverTeamId);

        if (t && u) {
          const avatarUrl = normalizeAvatar(u.image);
          solverDetails = {
            userId: u._id.toString(),
            userName: cp?.cfHandle || u.name,
            pizza_count: u.pizza_count || 0,
            userAvatar: avatarUrl,
            teamId: t._id.toString(),
            teamName: t.name,
            solveMs: firstSub.solveMs || 0,
          };
        }
      }

      return {
        id: p.problemId,
        name: `${p.problemId} - ${p.name}`,
        rating: p.rating || 0,
        points: p.points || 100,
        solved: !!solverDetails,
        solver: solverDetails,
      };
    });
  }

  // 4. Calculate user scores
  const userScores: Record<string, number> = {};
  for (const prob of processedProblems) {
    if (prob.solved && prob.solver) {
      userScores[prob.solver.userId] =
        (userScores[prob.solver.userId] || 0) + prob.points;
    }
  }

  // 5. Process teams with member contributions
  const processedTeams = teams.map((t) => {
    return {
      id: t._id.toString(),
      name: t.name || "Unknown Team",
      score: t.score || 0,
      members: users
        .filter((u) =>
          t.members?.some((m: any) => m.toString() === u._id.toString()),
        )
        .map((u) => {
          const cpUser = cpUsers.find(
            (cp) => cp.userId?.toString() === u._id.toString(),
          );
          const avatarUrl = normalizeAvatar(u.image);

          return {
            id: u._id.toString(),
            name: u.name || "Unknown User",
            pizza_count: u.pizza_count || 0,
            handle: cpUser?.cfHandle || u.name || "Unknown User",
            avatar: avatarUrl,
            contribution: userScores[u._id.toString()] || 0,
          };
        }),
    };
  });

  processedTeams.sort((a, b) => b.score - a.score);

  // 6. Unique MVP
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
    const mvpUser = users.find((u) => u._id.toString() === mvp);
    const mvpTeam = processedTeams.find((t) =>
      t.members.some((m) => m.id === mvp),
    );
    if (mvpUser && mvpTeam) {
      const cpUser = cpUsers.find((cp) => cp.userId?.toString() === mvp);
      const mvpAvatar = normalizeAvatar(mvpUser.image);

      mvpDetails = {
        userId: mvpUser._id.toString(),
        name: cpUser?.cfHandle || mvpUser.name || "Unknown User",
        pizza_count: mvpUser.pizza_count || 0,
        avatar: mvpAvatar,
        teamName: mvpTeam.name,
        contribution: maxUserScore,
      };
    }
  }

  let durationStr = "0m 0s";
  if (contest.startTime && contest.endTime) {
    const diffMs =
      new Date(contest.endTime).getTime() -
      new Date(contest.startTime).getTime();
    if (diffMs > 0) {
      const totalSeconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      durationStr = `${minutes}m ${seconds}s`;
    }
  } else if (submissions.length > 0) {
    const maxSolveMs = Math.max(...submissions.map((s) => s.solveMs || 0));
    if (maxSolveMs > 0) {
      const totalSeconds = Math.floor(maxSolveMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      durationStr = `${minutes}m ${seconds}s`;
    }
  }

  const matchData = {
    roomId: roomId,
    roomType: contest.mode === "arena" ? "Arena Format" : "Blitz Format",
    duration: durationStr,
    teams: processedTeams,
    problems: processedProblems,
    mvp: mvpDetails,
    isKnockout: contest.format === "bracket",
    contestId: contest._id.toString(),
    terminationReason: room.terminationReason,
    format: contest.format,
    isProcessing,
  };

  return (
    <PostMatchResultClient
      matchData={matchData}
      currentUserId={currentUserId}
      from={unwrappedSearch?.from}
    />
  );
}
