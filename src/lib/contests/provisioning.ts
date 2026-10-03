import mongoose from "mongoose";

import { connectMongoDB } from "@/lib/db/mongodb";
import { buildBracketTopology } from "@/lib/contests/bracketTopology";
import {
  configuredAllocationRound,
  problemAllocationError,
} from "@/lib/contests/problemAllocation";
import { fetchContestProblemContent } from "@/lib/contests/problemContent";
import { configureRoomTiming } from "@/lib/contests/roomTiming";

import type { IContestMatch } from "@/models/ContestMatch";
import ContestMatch from "@/models/ContestMatch";
import ContestProblemSet, {
  type ISelectedProblem,
} from "@/models/ContestProblemSet";
import ContestQuestion from "@/models/ContestQuestion";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";

export class ProblemAllocationError extends Error {}

export async function provisionProblems(
  contest: IContestMatch,
  solved: Set<string>,
  topology?: ReturnType<typeof buildBracketTopology>,
) {
  const error = problemAllocationError({
    ...contest.toObject(),
    entrantCapacity: contest.registrationSettings?.entrantCapacity,
    bracketType: contest.bracketSettings?.type,
  });

  if (error) throw new ProblemAllocationError(error);

  const matches = topology?.matches.filter((match) => match.playable);
  const count = contest.bulkProblemCount ?? 3;
  const allocations = new Map<string, ISelectedProblem[]>();
  let pool: Array<Partial<ISelectedProblem> & { problemId: string }> = [];

  if (contest.problemSelectionMode === "bulk") {
    pool = await ContestQuestion.aggregate([
      {
        $match: {
          rating: {
            $gte: Math.max(contest.bulkRatingMin ?? 800, 1),
            $lte: contest.bulkRatingMax ?? 1200,
          },
          ...(contest.bulkMinContestId
            ? { contestId: { $gte: contest.bulkMinContestId } }
            : {}),
          problemId: { $nin: [...solved] },
        },
      },
      { $sample: { size: (matches?.length ?? 1) * count } },
      { $sort: { rating: 1 } },
    ]);

    if (pool.length !== (matches?.length ?? 1) * count) {
      throw new ProblemAllocationError(
        "Not enough fresh problems for every required match and possible reset.",
      );
    }
  }

  const configured = topology
    ? buildBracketTopology(
        contest.registrationSettings!.entrantCapacity!,
        contest.bracketSettings?.type ?? "single_elimination",
      )
    : undefined;
  const slots = [...(contest.problemSlots ?? [])];
  const questions =
    contest.problemSelectionMode === "fine-tuned"
      ? await ContestQuestion.find({
          problemId: {
            $in: slots.flatMap((slot) =>
              slot.problemId ? [slot.problemId.toUpperCase()] : [],
            ),
          },
        }).lean()
      : [];

  for (const match of matches ?? [undefined]) {
    let selected: typeof pool;

    if (contest.problemSelectionMode === "bulk") {
      selected = pool.splice(0, count);
    } else if (contest.problemSelectionMode === "test") {
      // Development fixtures use the same content and timing pipeline
      selected = [
        { problemId: "4A", name: "Watermelon", rating: 800 },
        { problemId: "1A", name: "Theatre Square", rating: 1000 },
        { problemId: "158A", name: "Next Round", rating: 800 },
      ].slice(0, count);
    } else {
      const round = match
        ? configuredAllocationRound(match, topology!, configured!)
        : undefined;
      const chosen = slots
        .filter((slot) => !match || slot.roundNumber === round)
        .slice(0, match ? count : slots.length);

      if (!chosen.length || (match && chosen.length !== count))
        throw new ProblemAllocationError(
          `Missing problems for ${match?.roundName ?? "this match"}.`,
        );

      selected = chosen.map((slot) => {
        const problemId = slot.problemId!.trim().toUpperCase();
        const question = questions.find((item) => item.problemId === problemId);

        return {
          platform: slot.platform,
          problemId,
          points: slot.points,
          timeLimitMinutes: slot.timeLimitMinutes,
          name: question?.name ?? problemId,
          rating: question?.rating,
        };
      });

      for (const slot of chosen) slots.splice(slots.indexOf(slot), 1);
    }

    allocations.set(
      match?.position ?? "room",
      await Promise.all(
        selected.map(async (problem) => {
          const content = await fetchContestProblemContent(problem);

          return {
            ...content,
            platform: "codeforces",
            problemId: problem.problemId,
            name: content?.title ?? problem.name ?? problem.problemId,
            rating: problem.rating,
            points: problem.points ?? Math.floor((problem.rating ?? 1000) / 10),
            timeLimitMinutes:
              contest.mode === "blitz" ? problem.timeLimitMinutes : undefined,
          };
        }),
      ),
    );
  }

  return allocations;
}

export async function createProvisionedRoom(
  contestId: string,
  teams: Array<{ name: string; members: string[] }>,
  problems: ISelectedProblem[],
  status: "pending" | "waiting",
) {
  await connectMongoDB();

  return mongoose.connection.transaction(async () => {
    const contest = await ContestMatch.findOneAndUpdate(
      { _id: contestId },
      { $inc: { bracketRevision: 1 } },
      { returnDocument: "after" },
    );

    if (
      !contest ||
      contest.format === "bracket" ||
      contest.status === "completed"
    )
      throw new Error("Contest cannot open a direct room.");

    const existing = await ContestRoom.findOne({ contestId });

    if (existing) return existing;

    const room = new ContestRoom({
      contestId,
      name: `Room for ${contest.name}`,
      status,
      participants: teams.flatMap((team) => team.members),
    });
    const created = await ContestTeam.create(
      teams.map((team) => ({
        ...team,
        contestId,
        roomId: room._id,
        teamSize: team.members.length,
      })),
    );

    room.teams = created.map((team) => team._id);
    configureRoomTiming(room, contest);
    await room.save();
    await ContestProblemSet.create({ contestId, roomId: room._id, problems });

    return room;
  });
}
