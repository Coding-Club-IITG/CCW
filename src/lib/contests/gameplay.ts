import mongoose from "mongoose";

import { connectMongoDB } from "@/lib/db/mongodb";
import {
  decidePlayedOutcome,
  openMatchProblem,
  submissionWindow,
} from "@/lib/contests/matchScoring";
import { synchronizeRoomRuntime } from "@/lib/contests/roomRuntime";
import { publishContest, recordRoomActivity } from "@/lib/contests/events";

import ContestMatch, { type IContestMatch } from "@/models/ContestMatch";
import ContestParticipation from "@/models/ContestParticipation";
import ContestProblemSet, {
  type ISelectedProblem,
} from "@/models/ContestProblemSet";
import ContestRoom, { type IContestRoom } from "@/models/ContestRoom";
import ContestSubmission from "@/models/ContestSubmission";
import ContestTeam from "@/models/ContestTeam";

export interface MatchSubmission {
  submissionId: string;
  submittedAt: number;
  verdict: string;
}

export interface MatchSyncInput {
  userId: string;
  teamId: string;
  problemId: string;
  submissions: MatchSubmission[];
}

function endGameplay(
  room: IContestRoom,
  at: number,
  reason: "completed" | "timeout",
) {
  if (room.gameplayEndedAt) return;

  room.gameplayEndedAt = new Date(at);
  room.judgingDeadline = new Date(at + room.judgingGraceSeconds! * 1000);
  room.terminationReason = reason;

  for (const problem of room.problemStates) {
    if (problem.revealedAt !== undefined && problem.closedAt === undefined) {
      problem.closedAt = at;
      problem.closeReason = "match_end";
    }
  }
}

function advanceProblem(
  room: IContestRoom,
  problems: ISelectedProblem[],
  at: number,
) {
  room.currentProblemIndex += 1;

  if (room.currentProblemIndex === problems.length) {
    endGameplay(room, at, "completed");
  } else {
    openMatchProblem(
      room,
      problems[room.currentProblemIndex],
      room.currentProblemIndex,
      at,
      "blitz",
    );
  }
}

function applyDeadlines(
  room: IContestRoom,
  contest: IContestMatch,
  problems: ISelectedProblem[],
  now: number,
) {
  if (room.gameplayEndedAt) return;

  if (now >= room.matchDeadline!.getTime()) {
    endGameplay(room, room.matchDeadline!.getTime(), "timeout");
    return;
  }

  const current = room.problemStates[room.currentProblemIndex];

  if (
    contest.mode === "blitz" &&
    current?.deadlineAt !== undefined &&
    now >= current.deadlineAt &&
    current.closedAt === undefined
  ) {
    current.closedAt = current.deadlineAt;
    current.closeReason = "expired";

    // A delayed worker reveals the next problem when players can actually see it
    advanceProblem(room, problems, now);
  }
}

async function updateScores(room: IContestRoom, problems: ISelectedProblem[]) {
  const teams = await ContestTeam.find({
    _id: { $in: room.playingTeamIds },
    roomId: room._id,
  });
  const submissions = await ContestSubmission.find({ roomId: room._id }).sort({
    submittedAt: 1,
    submissionId: 1,
  });

  room.scoreStats = teams.map((team) => ({
    teamId: String(team._id),
    score: 0,
    solveTimeMs: 0,
    wrongSubmissions: 0,
    penaltyTimeMs: 0,
    lastSolveAt: 0,
    seed: team.seed,
  }));

  for (const submission of submissions) {
    const stats = room.scoreStats.find(
      (score) => score.teamId === String(submission.teamId),
    );

    if (stats && !["OK", "TESTING", "UNKNOWN"].includes(submission.verdict))
      stats.wrongSubmissions += 1;
  }

  await ContestSubmission.updateMany(
    { roomId: room._id },
    { $set: { points: 0 } },
  );

  for (let index = 0; index < room.problemStates.length; index++) {
    const state = room.problemStates[index];

    state.claim = undefined;

    const accepted = submissions.filter(
      (submission) =>
        submission.problemId === state.problemId && submission.verdict === "OK",
    );

    // Codeforces IDs resolve equal second timestamps consistently across retries
    accepted.sort(
      (a, b) =>
        a.submittedAt.getTime() - b.submittedAt.getTime() ||
        Number(a.submissionId) - Number(b.submissionId),
    );

    const winner = accepted[0];

    if (!winner) continue;

    const stats = room.scoreStats.find(
      (score) => score.teamId === String(winner.teamId),
    );

    if (!stats)
      throw new Error("A problem claim must belong to an admitted team.");

    const submittedAt = winner.submittedAt.getTime();
    const solveMs = submittedAt - state.revealedAt!;
    const points = problems[index].points;

    state.claim = {
      userId: String(winner.userId),
      teamId: stats.teamId,
      submissionId: winner.submissionId,
      submittedAt,
    };
    stats.score += points;
    stats.solveTimeMs += solveMs;
    stats.penaltyTimeMs += submittedAt - room.actualStartTime!.getTime();
    stats.lastSolveAt = Math.max(stats.lastSolveAt, submittedAt);

    await ContestSubmission.updateOne(
      { _id: winner._id },
      { $set: { points, solveMs } },
    );
  }

  for (const stats of room.scoreStats) {
    stats.penaltyTimeMs +=
      stats.wrongSubmissions * room.arenaWrongPenaltySeconds! * 1000;
    await ContestTeam.updateOne(
      { _id: stats.teamId, roomId: room._id },
      { $set: { score: stats.score } },
    );
  }
}

async function finalizeMatch(
  room: IContestRoom,
  contest: IContestMatch,
  effects: Array<() => Promise<void>>,
  now: number,
) {
  if (!room.judgingDeadline || now < room.judgingDeadline.getTime()) return;

  const outcome = decidePlayedOutcome(
    room.scoreStats,
    contest.mode,
    contest.format === "bracket",
  );

  room.winnerTeamId = outcome.winnerId
    ? new mongoose.Types.ObjectId(outcome.winnerId)
    : undefined;
  room.resultMethod = outcome.method;
  room.finalizedAt = new Date(now);
  room.actualEndTime = new Date(now);
  room.status = "ended";
  await room.save();
  await ContestParticipation.deleteMany({ roomId: room._id });

  if (contest.format === "bracket") {
    const { advanceWinner } = await import("@/lib/contests/bracket");

    await advanceWinner(
      String(room._id),
      String(contest._id),
      outcome.winnerId,
      effects,
    );
  } else if (
    !(await ContestRoom.exists({
      contestId: contest._id,
      status: { $ne: "ended" },
    }))
  ) {
    contest.status = "completed";
    contest.endTime = new Date(now);
    contest.winner = room.winnerTeamId;
    contest.winnerName = outcome.winnerId
      ? (await ContestTeam.findById(outcome.winnerId))?.name
      : "Draw";
    await contest.save();
  }
}

export async function reconcileMatch(
  roomId: string,
  input?: MatchSyncInput,
  at?: number,
) {
  await connectMongoDB();

  const reference = await ContestRoom.findById(roomId)
    .select("contestId")
    .lean();

  if (!reference) return { accepted: false, verdict: "room_not_found" };

  const committed = await mongoose.connection.transaction(async () => {
    const effects: Array<() => Promise<void>> = [];
    const contest = await ContestMatch.findOneAndUpdate(
      { _id: reference.contestId },
      { $inc: { bracketRevision: 1 } },
      { returnDocument: "after" },
    );
    const room = await ContestRoom.findOneAndUpdate(
      { _id: roomId },
      { $inc: { participationRevision: 1 } },
      { returnDocument: "after" },
    );
    const now = at ?? Date.now();

    if (!contest || !room || room.status !== "active" || room.finalizedAt) {
      return { effects, accepted: false, verdict: "room_not_active" };
    }

    const problemSet = await ContestProblemSet.findOne({ roomId });

    if (
      !problemSet ||
      room.problemStates.length !== problemSet.problems.length
    ) {
      throw new Error("Active room problem progress is incomplete.");
    }

    const problems = problemSet.problems;
    const previousClaims = new Map(
      room.problemStates.map((problem) => [
        problem.problemId,
        problem.claim?.submissionId,
      ]),
    );
    const previousIndex = room.currentProblemIndex;

    applyDeadlines(room, contest, problems, now);

    let accepted = false;
    let verdict = "not_found";

    if (input) {
      const admission = room.admissions.find(
        (entry) =>
          String(entry.userId) === input.userId &&
          String(entry.teamId) === input.teamId,
      );
      const state = room.problemStates.find(
        (problem) => problem.problemId === input.problemId,
      );

      if (admission && state) {
        const window = submissionWindow(
          room,
          state,
          admission.admittedAt.getTime(),
        );

        for (const submission of input.submissions) {
          if (
            now > window.judgingDeadline ||
            submission.submittedAt < window.opensAt ||
            submission.submittedAt > window.deadline
          )
            continue;

          verdict = submission.verdict;

          await ContestSubmission.updateOne(
            { roomId, submissionId: submission.submissionId },
            {
              $set: {
                contestId: contest._id,
                userId: input.userId,
                teamId: input.teamId,
                problemId: input.problemId,
                platform: "codeforces",
                verdict,
                submittedAt: new Date(submission.submittedAt),
                points: 0,
                solveMs: submission.submittedAt - state.revealedAt!,
              },
            },
            { upsert: true },
          );

          accepted ||= verdict === "OK";
        }
      } else {
        verdict = "not_admitted";
      }
    }

    await updateScores(room, problems);

    if (!room.gameplayEndedAt) {
      if (contest.mode === "arena") {
        if (room.problemStates.every((problem) => problem.claim))
          endGameplay(room, now, "completed");
      } else {
        const current = room.problemStates[room.currentProblemIndex];

        if (current?.claim && current.closedAt === undefined) {
          current.closedAt = now;
          current.closeReason = "solved";
          advanceProblem(room, problems, now);
        }
      }
    }

    room.runtimeSyncPending = true;
    await room.save();
    await finalizeMatch(room, contest, effects, now);
    effects.push(() => synchronizeRoomRuntime(roomId));

    for (const problem of room.problemStates) {
      if (
        problem.claim &&
        problem.claim.submissionId !== previousClaims.get(problem.problemId)
      ) {
        effects.push(async () => {
          await recordRoomActivity(roomId, {
            icon: "check_circle",
            text: `Accepted submission on ${problem.problemId}. Scores updated.`,
            color: "text-primary",
          });
        });
      }
    }

    if (
      room.currentProblemIndex !== previousIndex &&
      room.problemStates[previousIndex]?.closeReason === "expired"
    ) {
      effects.push(async () => {
        await recordRoomActivity(roomId, {
          icon: "info",
          text: "Problem timer expired. No expiry points awarded.",
          color: "text-secondary",
        });
      });
    }

    if (contest.format === "bracket") {
      effects.push(async () => {
        await publishContest(String(contest._id), {
          type: "contest.bracket_update",
        });
      });
    }

    return { effects, accepted, verdict: accepted ? "OK" : verdict };
  });

  for (const effect of committed.effects) await effect();

  return { accepted: committed.accepted, verdict: committed.verdict };
}
