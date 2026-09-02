import mongoose from "mongoose";

import { publishContest } from "@/lib/contests/events";
import dbConnect from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/utils";
import ContestMatch, {
  type IContestMatch,
  type IProblemSlot,
} from "@/models/ContestMatch";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestQuestion from "@/models/ContestQuestion";
import ContestRound, { type IContestRound } from "@/models/ContestRound";
import ContestRoom, { type IContestRoom } from "@/models/ContestRoom";
import ContestTeam, { type IContestTeam } from "@/models/ContestTeam";
import CPUser from "@/models/CPUser";
import User, { type UserRecord } from "@/models/User";
import {
  type BracketNode,
  type BracketSnapshot,
  getRoundName,
  snakeSeed,
  nextPowerOf2,
} from "@/types/bracket";

type BracketProblem = {
  problemId: string;
  name?: string;
  rating?: number;
};

export type DeferredBracketEffect = () => Promise<void>;

async function runOrDeferEffect(
  deferredEffects: DeferredBracketEffect[] | undefined,
  effect: DeferredBracketEffect,
) {
  if (deferredEffects) {
    deferredEffects.push(effect);
    return;
  }

  await effect();
}

function toStr(id: mongoose.Types.ObjectId | string): string {
  return typeof id === "string" ? id : id.toString();
}

async function addTeamToRoom(
  room: IContestRoom,
  sourceTeam: IContestTeam,
  contest: IContestMatch,
  round: IContestRound,
  deferredEffects?: DeferredBracketEffect[],
) {
  const newTeam = await ContestTeam.create({
    roomId: room._id,
    name: sourceTeam.name,
    members: sourceTeam.members,
    teamSize: sourceTeam.teamSize,
    score: 0,
    contestId: contest._id,
    roundId: round._id,
  });
  await ContestRoom.findByIdAndUpdate(room._id, {
    $addToSet: { teams: newTeam._id },
  });
  const updatedRoom = await ContestRoom.findById(room._id);
  if (updatedRoom && updatedRoom.teams.length === 2) {
    const teams = await ContestTeam.find({ roomId: room._id }).lean();
    updatedRoom.participants = teams.flatMap((team) => team.members);
    updatedRoom.status = "waiting";
    await updatedRoom.save();
    await runOrDeferEffect(deferredEffects, async () => {
      await initBracketRoomRedis(
        await getRedis(),
        toStr(room._id),
        contest.mode || "blitz",
        teams,
        contest.durationSeconds || 3600,
        toStr(contest._id),
      );
    });
  }
  return newTeam;
}

async function completeContestIfReady(
  contest: IContestMatch,
  deferredEffects?: DeferredBracketEffect[],
) {
  const rounds = await ContestRound.find({ contestId: contest._id });
  const finalRound = rounds.find(
    (round) => !round.isThirdPlacePlayoff && round.name === "Final",
  );
  const finalRoom =
    finalRound &&
    (await ContestRoom.findOne({ _id: { $in: finalRound.rooms } }));
  const playoffRound = rounds.find((round) => round.isThirdPlacePlayoff);
  const playoffRoom =
    playoffRound &&
    (await ContestRoom.findOne({ _id: { $in: playoffRound.rooms } }));
  if (
    !finalRoom ||
    finalRoom.status !== "ended" ||
    (playoffRoom && playoffRoom.status !== "ended")
  )
    return false;

  const finalTeams = await ContestTeam.find({ roomId: finalRoom._id });
  const winner = finalTeams.reduce(
    (best, team) => (!best || team.score > best.score ? team : best),
    null as (typeof finalTeams)[number] | null,
  );
  if (!winner) return false;
  contest.winner = winner._id;
  contest.winnerName = winner.name || "";
  contest.status = "completed";
  await contest.save();
  await runOrDeferEffect(deferredEffects, async () => {
    const redis = await getRedis();
    const keys = await redis.keys(`contest:${toStr(contest._id)}:*`);
    if (keys.length > 0) await redis.del(keys);
  });
  return true;
}

/**
 * Initialise all Redis keys for a bracket match room that is transitioning to `waiting`.
 * Mirrors the key structure used by non-bracket rooms so the ready route, SSE presence,
 * and sync worker can all locate the room correctly.
 */
async function initBracketRoomRedis(
  redis: Awaited<ReturnType<typeof getRedis>>,
  roomId: string,
  mode: string,
  teamDocs: {
    _id: mongoose.Types.ObjectId;
    name: string;
    members: mongoose.Types.ObjectId[];
    score: number;
  }[],
  durationSeconds = 3600,
  contestId: string,
) {
  await redis.hSet(`room:${roomId}:state`, {
    status: "waiting",
    type: mode,
    startTime: "",
    timeLimit: durationSeconds.toString(),
    readyCount: "0",
    contestId: contestId,
  });
  const teamIds = teamDocs.map((t) => toStr(t._id));
  if (teamIds.length > 0) {
    await redis.sAdd(`room:${roomId}:teams`, teamIds);
  }
  for (const team of teamDocs) {
    const tId = toStr(team._id);
    await redis.hSet(`team:${tId}:meta`, { name: team.name, score: "0" });
    const memberStrs = team.members.map((m) => toStr(m));
    if (memberStrs.length > 0) {
      await redis.sAdd(`team:${tId}:users`, memberStrs);
    }
  }
}

export async function generateBracket(
  contestId: string,
  solvedProblemIds?: Set<string>,
  deferredEffects?: DeferredBracketEffect[],
) {
  await dbConnect();
  const contest = await ContestMatch.findById(contestId);
  if (!contest) throw new Error("Contest not found");
  if (contest.format !== "bracket")
    throw new Error("Contest is not a bracket format");
  if (contest.status !== "provisioning")
    throw new Error(
      "Contest must be in 'provisioning' status to generate bracket",
    );

  const existingRooms = await ContestRoom.countDocuments({ contestId });
  if (existingRooms > 0)
    throw new Error("Bracket already generated for this contest");

  const teamSize = contest.teamSize || 1;
  const mode = contest.mode || "blitz";

  const groupedTeams = groupRegistrationsIntoTeams(
    contest.registrations ?? [],
    teamSize,
  );

  const cpUsers = await CPUser.find({
    userId: { $in: groupedTeams.flatMap((t) => t.memberIds) },
  }).lean();
  const ratingMap = new Map<string, number>();
  for (const u of cpUsers) {
    ratingMap.set(toStr(u.userId), u.cfRating || 0);
  }

  const seededTeams = groupedTeams.map((team) => {
    const avgRating =
      team.memberIds.reduce((sum, id) => sum + (ratingMap.get(id) || 0), 0) /
      team.memberIds.length;
    return { ...team, rating: avgRating };
  });
  seededTeams.sort((a, b) => b.rating - a.rating);

  const bracketSize = nextPowerOf2(seededTeams.length);
  const totalRounds = Math.log2(bracketSize);
  const shouldHaveThirdPlacePlayoff =
    Boolean(contest.bracketSettings?.thirdPlacePlayoff) &&
    totalRounds >= 2 &&
    seededTeams.length >= 4;

  const seededOrder = snakeSeed(
    seededTeams.map((t, i) => ({ teamId: t.teamName, seed: i + 1 })),
  );

  const matchAssignments: ((typeof seededTeams)[0] | null)[] = [];
  for (let i = 0; i < bracketSize; i++) {
    if (i < seededOrder.length) {
      const matchTeam = seededTeams.find(
        (t) => t.teamName === seededOrder[i].teamId,
      );
      matchAssignments.push(matchTeam || null);
    } else {
      matchAssignments.push(null);
    }
  }

  const rounds: (typeof ContestRound.prototype)[] = [];
  for (let r = 0; r < totalRounds; r++) {
    const roundNum = r + 1;
    const round = await ContestRound.create({
      contestId: contest._id,
      roundNumber: roundNum,
      name: getRoundName(roundNum, totalRounds),
      status: r === 0 ? ("active" as const) : ("pending" as const),
      rooms: [],
      bracketLevel: r === 0 ? "round1" : `round${r + 1}`,
    });
    rounds.push(round);
  }

  const allRoomIds: string[] = [];
  let roundIndex = 0;

  const problemCount = contest.bulkProblemCount || 3;
  const minRating = contest.bulkRatingMin || 800;
  const maxRating = contest.bulkRatingMax || 1200;
  const minContestId = contest.bulkMinContestId || 0;

  let bulkProblemPool: BracketProblem[] = [];
  if (contest.problemSelectionMode === "bulk") {
    const totalRooms = bracketSize - 1 + (shouldHaveThirdPlacePlayoff ? 1 : 0);
    const totalProblemsNeeded = totalRooms * problemCount;
    const excludeIds = solvedProblemIds ? Array.from(solvedProblemIds) : [];
    bulkProblemPool = await ContestQuestion.aggregate<BracketProblem>([
      {
        $match: {
          rating: { $gte: minRating, $lte: maxRating },
          ...(minContestId > 0 ? { contestId: { $gte: minContestId } } : {}),
          ...(excludeIds.length > 0 ? { problemId: { $nin: excludeIds } } : {}),
        },
      },
      { $sample: { size: totalProblemsNeeded } },
      { $sort: { rating: 1 } },
    ]);
  }
  const fineTunedPool = (contest.problemSlots || []).filter(
    (slot): slot is IProblemSlot & { problemId: string } =>
      Boolean(slot.problemId),
  );

  for (const round of rounds) {
    const matchesInRound = Math.pow(2, totalRounds - roundIndex - 1);
    const roundRooms: mongoose.Types.ObjectId[] = [];

    for (let m = 0; m < matchesInRound; m++) {
      const bracketPos = `${roundIndex}-${m}`;
      const leftTeamId =
        roundIndex === 0 ? getTeamByMatchIndex(matchAssignments, m * 2) : null;
      const rightTeamId =
        roundIndex === 0
          ? getTeamByMatchIndex(matchAssignments, m * 2 + 1)
          : null;

      const hasNoTeams = !leftTeamId && !rightTeamId;
      const isBye = !hasNoTeams && (!leftTeamId || !rightTeamId);
      const roomStatus = hasNoTeams
        ? ("pending" as const)
        : isBye
          ? ("ended" as const)
          : ("waiting" as const);

      const room = await ContestRoom.create({
        contestId: contest._id,
        name: `${round.name} - Match ${m + 1}`,
        status: roomStatus,
        participants: [],
        teams: [],
        currentRoundId: round._id,
        currentProblemIndex: 0,
        firstSolvers: [],
        bracketPosition: bracketPos,
      });

      const teamIds: (mongoose.Types.ObjectId | null)[] = [null, null];

      if (leftTeamId) {
        const team = await ContestTeam.create({
          roomId: room._id,
          name: leftTeamId.teamName,
          members: leftTeamId.memberIds.map(
            (id) => new mongoose.Types.ObjectId(id),
          ),
          teamSize,
          score: 0,
          contestId: contest._id,
          roundId: round._id,
        });
        teamIds[0] = team._id;
      }
      if (rightTeamId) {
        const team = await ContestTeam.create({
          roomId: room._id,
          name: rightTeamId.teamName,
          members: rightTeamId.memberIds.map(
            (id) => new mongoose.Types.ObjectId(id),
          ),
          teamSize,
          score: 0,
          contestId: contest._id,
          roundId: round._id,
        });
        teamIds[1] = team._id;
      }

      room.teams = teamIds.filter(Boolean) as mongoose.Types.ObjectId[];

      // Populate participants for waiting rooms so the SSE presence system can find them
      if (roomStatus === "waiting" && leftTeamId && rightTeamId) {
        room.participants = [
          ...leftTeamId.memberIds,
          ...rightTeamId.memberIds,
        ].map((id) => new mongoose.Types.ObjectId(id));
      }

      await room.save();

      let assignedProblems: BracketProblem[] = [];
      if (contest.problemSelectionMode === "fine-tuned") {
        const roundSlots = fineTunedPool.filter(
          (problem) => problem.roundNumber === roundIndex + 1,
        );
        const toAssign = roundSlots.slice(0, problemCount);
        assignedProblems = toAssign;
        // Remove used problems from the pool
        toAssign.forEach((a) => {
          const idx = fineTunedPool.findIndex(
            (p) => p.problemId === a.problemId,
          );
          if (idx !== -1) fineTunedPool.splice(idx, 1);
        });
      } else if (contest.problemSelectionMode === "bulk") {
        assignedProblems = bulkProblemPool.splice(0, problemCount);
      } else if (contest.problemSelectionMode === "test") {
        assignedProblems = [
          { problemId: "4A", name: "Watermelon", rating: 800 },
          { problemId: "1A", name: "Theatre Square", rating: 1000 },
          { problemId: "158A", name: "Next Round", rating: 800 },
        ].slice(0, problemCount);
      }

      if (assignedProblems.length > 0) {
        const problemSet = new ContestProblemSet({
          contestId: contest._id,
          roomId: room._id,
          problems: assignedProblems.map((problem) => ({
            platform: "codeforces",
            problemId: problem.problemId,
            name: problem.name || problem.problemId,
            rating: problem.rating || 0,
            points: Math.floor((problem.rating || 1000) / 10),
          })),
        });
        await problemSet.save();

        const redisProblems = assignedProblems.map((problem) =>
          JSON.stringify({
            problemId: problem.problemId,
            name: problem.name || problem.problemId,
            rating: problem.rating || 0,
            points: Math.floor((problem.rating || 1000) / 10),
            revealedAt: null,
          }),
        );
        const roomId = toStr(room._id);
        await runOrDeferEffect(deferredEffects, async () => {
          const redis = await getRedis();
          await redis.del(`room:${roomId}:problems`);
          await redis.rPush(`room:${roomId}:problems`, redisProblems);
        });
      }

      if (roundIndex === 0 && roomStatus === "waiting") {
        const round1TeamDocs = await ContestTeam.find({
          roomId: room._id,
        }).lean();
        const roomId = toStr(room._id);
        const durationSeconds = contest.durationSeconds || 3600;
        const bracketContestId = toStr(contest._id);
        await runOrDeferEffect(deferredEffects, async () => {
          await initBracketRoomRedis(
            await getRedis(),
            roomId,
            mode,
            round1TeamDocs,
            durationSeconds,
            bracketContestId,
          );
        });
      }

      roundRooms.push(room._id);
      allRoomIds.push(toStr(room._id));

      if (isBye && !hasNoTeams) {
        const winnerTeam = teamIds[0] || teamIds[1];
        if (winnerTeam) {
          await ContestTeam.findByIdAndUpdate(winnerTeam, { score: 1 });
          const nextRoundIdx = roundIndex + 1;
          if (nextRoundIdx < rounds.length) {
            const matchIdx = Math.floor(m / 2);
            await seedTeamToRound(
              rounds[nextRoundIdx]._id,
              winnerTeam,
              matchIdx,
              contest._id,
              deferredEffects,
            );
          } else {
            contest.winner = winnerTeam;
            contest.status = "completed";
            await contest.save();
          }
        }
      }
    }

    round.rooms = roundRooms;
    await round.save();
    roundIndex++;
  }

  // The bronze match is deliberately kept out of the elimination round chain.
  // It is populated by the losers of the two semi-finals once those matches end.
  if (shouldHaveThirdPlacePlayoff) {
    const playoffRound = await ContestRound.create({
      contestId: contest._id,
      roundNumber: totalRounds + 1,
      name: "Third Place Playoff",
      status: "pending",
      rooms: [],
      bracketLevel: "third_place",
      isThirdPlacePlayoff: true,
    });
    const playoffRoom = await ContestRoom.create({
      contestId: contest._id,
      name: "Third Place Playoff",
      status: "pending",
      participants: [],
      teams: [],
      currentRoundId: playoffRound._id,
      currentProblemIndex: 0,
      firstSolvers: [],
      bracketPosition: "third-place",
    });
    playoffRound.rooms = [playoffRoom._id];
    await playoffRound.save();
    allRoomIds.push(toStr(playoffRoom._id));

    let assignedProblems: BracketProblem[] = [];
    if (contest.problemSelectionMode === "fine-tuned") {
      assignedProblems = fineTunedPool
        .filter((problem) => problem.roundNumber === totalRounds + 1)
        .slice(0, problemCount);
    } else if (contest.problemSelectionMode === "bulk") {
      assignedProblems = bulkProblemPool.splice(0, problemCount);
    } else if (contest.problemSelectionMode === "test") {
      assignedProblems = [
        { problemId: "4A", name: "Watermelon", rating: 800 },
        { problemId: "1A", name: "Theatre Square", rating: 1000 },
        { problemId: "158A", name: "Next Round", rating: 800 },
      ].slice(0, problemCount);
    }
    if (assignedProblems.length > 0) {
      await ContestProblemSet.create({
        contestId: contest._id,
        roomId: playoffRoom._id,
        problems: assignedProblems.map((problem) => ({
          platform: "codeforces",
          problemId: problem.problemId,
          name: problem.name || problem.problemId,
          rating: problem.rating || 0,
          points: Math.floor((problem.rating || 1000) / 10),
        })),
      });
      const redisProblems = assignedProblems.map((problem) =>
        JSON.stringify({
          problemId: problem.problemId,
          name: problem.name || problem.problemId,
          rating: problem.rating || 0,
          points: Math.floor((problem.rating || 1000) / 10),
          revealedAt: null,
        }),
      );
      const playoffRoomId = toStr(playoffRoom._id);
      await runOrDeferEffect(deferredEffects, async () => {
        const redis = await getRedis();
        await redis.del(`room:${playoffRoomId}:problems`);
        await redis.rPush(`room:${playoffRoomId}:problems`, redisProblems);
      });
    }
  }

  await runOrDeferEffect(deferredEffects, async () => {
    const redis = await getRedis();
    await redis.hSet(`contest:${contestId}:meta`, {
      format: "knockout",
      currentRound: "1",
      status: "provisioning",
    });
    if (allRoomIds.length > 0) {
      await redis.sAdd(`contest:${contestId}:rooms`, allRoomIds);
    }
  });

  const snapshot = await getBracketSnapshot(contestId);
  await runOrDeferEffect(deferredEffects, async () => {
    const committedSnapshot = await getBracketSnapshot(contestId);
    await publishContest(contestId, {
      type: "contest.bracket_update",
      ...committedSnapshot,
    });
  });

  logger.info(
    `[Bracket] Generated bracket for contest ${contestId}: ${allRoomIds.length} rooms across ${totalRounds} rounds`,
  );
  return snapshot;
}

function groupRegistrationsIntoTeams(
  registrations: {
    userId: mongoose.Types.ObjectId;
    cfHandle: string;
    teamName?: string;
    registeredAt: Date;
  }[],
  teamSize: number,
): { teamName: string; memberIds: string[] }[] {
  if (teamSize === 1) {
    return registrations.map((r) => ({
      teamName: r.cfHandle || toStr(r.userId).slice(-6),
      memberIds: [toStr(r.userId)],
    }));
  }

  const groups = new Map<string, { teamName: string; memberIds: string[] }>();
  for (const reg of registrations) {
    const key = reg.teamName || `team-${toStr(reg.userId).slice(-6)}`;
    if (!groups.has(key)) {
      groups.set(key, { teamName: key, memberIds: [] });
    }
    groups.get(key)!.memberIds.push(toStr(reg.userId));
  }

  const valid: { teamName: string; memberIds: string[] }[] = [];
  for (const [, group] of groups) {
    if (group.memberIds.length === teamSize) {
      valid.push(group);
    } else {
      logger.warn(
        `[Bracket] Team "${group.teamName}" has ${group.memberIds.length} members, expected ${teamSize}. Skipping.`,
      );
    }
  }
  return valid;
}

function getTeamByMatchIndex(
  assignments: ({
    teamName: string;
    memberIds: string[];
    rating: number;
  } | null)[],
  index: number,
): { teamName: string; memberIds: string[]; rating: number } | null {
  if (index < 0 || index >= assignments.length) return null;
  return assignments[index];
}

async function seedTeamToRound(
  roundId: mongoose.Types.ObjectId,
  teamId: mongoose.Types.ObjectId,
  matchIndex: number,
  contestId: mongoose.Types.ObjectId,
  deferredEffects?: DeferredBracketEffect[],
) {
  const round = await ContestRound.findById(roundId);
  if (!round) return;

  const rooms = await ContestRoom.find({ _id: { $in: round.rooms } }).sort({
    createdAt: 1,
  });
  const targetRoom = rooms[matchIndex];
  if (!targetRoom) return;

  const oldTeam = await ContestTeam.findById(teamId);
  if (!oldTeam) return;

  const newTeam = await ContestTeam.create({
    roomId: targetRoom._id,
    name: oldTeam.name,
    members: oldTeam.members,
    teamSize: oldTeam.teamSize,
    score: 0,
    contestId: contestId,
    roundId: roundId,
  });

  await ContestRoom.findByIdAndUpdate(targetRoom._id, {
    $addToSet: { teams: newTeam._id },
  });

  const updatedRoom = await ContestRoom.findById(targetRoom._id);
  if (updatedRoom && updatedRoom.teams.length === 2) {
    // Populate participants for SSE presence tracking
    const allTeamDocs = await ContestTeam.find({
      roomId: targetRoom._id,
    }).lean();
    const allMemberIds = allTeamDocs.flatMap((t) => t.members);
    updatedRoom.participants = allMemberIds;
    updatedRoom.status = "waiting";
    await updatedRoom.save();

    // Initialise Redis state so the ready route can find the room
    const contest = await ContestMatch.findById(contestId).lean();
    const targetRoomId = toStr(targetRoom._id);
    const contestMode = contest?.mode || "blitz";
    const durationSeconds = contest?.durationSeconds || 3600;
    const bracketContestId = toStr(contestId);
    await runOrDeferEffect(deferredEffects, async () => {
      await initBracketRoomRedis(
        await getRedis(),
        targetRoomId,
        contestMode,
        allTeamDocs,
        durationSeconds,
        bracketContestId,
      );
    });

    logger.info(`[Bracket] Room ${targetRoom._id} is now ready with 2 teams`);
  }
}

export async function advanceWinner(
  roomId: string,
  contestId: string,
  winnerTeamId: string | null,
  deferredEffects?: DeferredBracketEffect[],
) {
  if (!winnerTeamId) {
    logger.warn(
      `[Bracket] advanceWinner called for room ${roomId} with null winner`,
    );
    return;
  }

  await dbConnect();
  const room = await ContestRoom.findById(roomId).populate<{
    currentRoundId: IContestRound;
  }>("currentRoundId");
  if (!room) {
    logger.warn(`[Bracket] Room ${roomId} not found for advancement`);
    return;
  }

  const contest = await ContestMatch.findById(contestId);
  if (!contest || contest.format !== "bracket") return;

  const currentRound = room.currentRoundId;

  if (!currentRound) return;

  const bracketPos = room.bracketPosition;
  if (!bracketPos) return;

  const matchIndex = parseInt(bracketPos.split("-")[1], 10);

  if (currentRound.isThirdPlacePlayoff) {
    await completeContestIfReady(contest, deferredEffects);
    await runOrDeferEffect(deferredEffects, async () => {
      const snapshot = await getBracketSnapshot(contestId);
      await publishContest(contestId, {
        type: "contest.bracket_update",
        ...snapshot,
      });
    });
    return;
  }

  // Semi-final losers feed the bronze match; winners continue through the main bracket.
  const mainRounds = await ContestRound.countDocuments({
    contestId,
    isThirdPlacePlayoff: { $ne: true },
  });
  if (
    contest.bracketSettings?.thirdPlacePlayoff &&
    mainRounds >= 2 &&
    currentRound.roundNumber === mainRounds - 1
  ) {
    const losingTeamId = room.teams
      .map(toStr)
      .find((teamId) => teamId !== winnerTeamId);
    const playoffRound = await ContestRound.findOne({
      contestId,
      isThirdPlacePlayoff: true,
    });
    const playoffRoom =
      playoffRound &&
      (await ContestRoom.findOne({ _id: { $in: playoffRound.rooms } }));
    if (losingTeamId && playoffRound && playoffRoom) {
      const losingTeam = await ContestTeam.findById(losingTeamId);
      if (losingTeam)
        await addTeamToRoom(
          playoffRoom,
          losingTeam,
          contest,
          playoffRound,
          deferredEffects,
        );
    }
  }

  const nextRound = await ContestRound.findOne({
    contestId,
    roundNumber: currentRound.roundNumber + 1,
    isThirdPlacePlayoff: { $ne: true },
  });
  if (!nextRound) {
    const completed = await completeContestIfReady(contest, deferredEffects);
    if (completed)
      logger.info(
        `[Bracket] Contest ${contestId} completed. Winner: ${winnerTeamId}`,
      );

    await runOrDeferEffect(deferredEffects, async () => {
      const finalSnapshot = await getBracketSnapshot(contestId);
      await publishContest(contestId, {
        type: "contest.bracket_update",
        ...finalSnapshot,
      });
    });
    const completedRoundNumber = currentRound.roundNumber;
    await runOrDeferEffect(deferredEffects, async () => {
      await publishContest(contestId, {
        type: "contest.round_complete",
        roundNumber: completedRoundNumber,
        advancingTeams: [winnerTeamId],
      });
    });

    return;
  }

  const nextMatchIndex = Math.floor(matchIndex / 2);
  const nextRooms = await ContestRoom.find({
    _id: { $in: nextRound.rooms },
  }).sort({ createdAt: 1 });
  const nextRoom = nextRooms[nextMatchIndex];
  if (!nextRoom) {
    logger.warn(
      `[Bracket] No next room found for match ${nextMatchIndex} in round ${nextRound.roundNumber}`,
    );
    return;
  }

  const winnerTeamDoc = await ContestTeam.findById(winnerTeamId);
  if (!winnerTeamDoc) {
    logger.warn(`[Bracket] Winner team ${winnerTeamId} not found`);
    return;
  }

  await addTeamToRoom(
    nextRoom,
    winnerTeamDoc,
    contest,
    nextRound,
    deferredEffects,
  );

  await runOrDeferEffect(deferredEffects, async () => {
    await publishContest(contestId, {
      type: "contest.standing_update",
      teamId: winnerTeamId,
      contestId,
    });
  });

  await runOrDeferEffect(deferredEffects, async () => {
    const snapshot = await getBracketSnapshot(contestId);
    await publishContest(contestId, {
      type: "contest.bracket_update",
      ...snapshot,
    });
  });

  logger.info(
    `[Bracket] Advanced team ${winnerTeamId} to room ${nextRoom._id}`,
  );
}

export async function checkRoundCompletion(
  contestId: string,
  roundNumber: number,
  deferredEffects?: DeferredBracketEffect[],
) {
  await dbConnect();
  const lockKey = `contest:${contestId}:round:${roundNumber}:check_lock`;
  let redis: Awaited<ReturnType<typeof getRedis>> | undefined;
  let lockAcquired = false;

  if (!deferredEffects) {
    redis = await getRedis();
    lockAcquired = Boolean(await redis.set(lockKey, "1", { NX: true, EX: 5 }));
    if (!lockAcquired) {
      logger.info(
        `[Bracket] Round ${roundNumber} check already in progress for contest ${contestId}`,
      );
      return;
    }
  }

  try {
    const contest = await ContestMatch.findById(contestId);
    if (!contest || contest.format !== "bracket") return;

    const round = await ContestRound.findOne({ contestId, roundNumber });
    if (!round) return;

    const rooms = await ContestRoom.find({ _id: { $in: round.rooms } });
    const allCompleted = rooms.every((r) => r.status === "ended");
    if (!allCompleted) return;

    const advancingTeams: string[] = [];
    for (const room of rooms) {
      if (room.teams.length === 2) {
        const teamScores = [];
        for (const teamId of room.teams) {
          teamScores.push(await ContestTeam.findById(teamId));
        }
        const winner = teamScores.reduce(
          (best, t) => (t && (!best || t.score > best.score) ? t : best),
          null as (typeof teamScores)[0],
        );
        if (winner) advancingTeams.push(toStr(winner._id));
      } else if (room.teams.length === 1) {
        advancingTeams.push(toStr(room.teams[0]));
      }
    }

    round.status = "completed";
    await round.save();

    await runOrDeferEffect(deferredEffects, async () => {
      await (
        await getRedis()
      ).hSet(`contest:${contestId}:meta`, {
        currentRound: String(roundNumber + 1),
      });
    });

    await runOrDeferEffect(deferredEffects, async () => {
      await publishContest(contestId, {
        type: "contest.round_complete",
        roundNumber,
        advancingTeams,
      });
    });

    await runOrDeferEffect(deferredEffects, async () => {
      const snapshot = await getBracketSnapshot(contestId);
      await publishContest(contestId, {
        type: "contest.bracket_update",
        ...snapshot,
      });
    });

    const nextRound = await ContestRound.findOne({
      contestId,
      roundNumber: roundNumber + 1,
      isThirdPlacePlayoff: { $ne: true },
    });
    if (nextRound) {
      nextRound.status = "active";
      await nextRound.save();
      logger.info(
        `[Bracket] Round ${roundNumber} complete. Advancing to round ${roundNumber + 1}`,
      );
    } else if (contest.status === "completed") {
      logger.info(`[Bracket] Contest ${contestId} fully completed.`);
      await runOrDeferEffect(deferredEffects, async () => {
        const redisClient = await getRedis();
        const keys = await redisClient.keys(`contest:${contestId}:*`);
        if (keys.length > 0) await redisClient.del(keys);
      });
    }
  } finally {
    if (redis && lockAcquired) await redis.del(lockKey);
  }
}

export async function getBracketSnapshot(
  contestId: string,
): Promise<BracketSnapshot> {
  await dbConnect();
  const contest = await ContestMatch.findById(contestId);
  if (!contest) throw new Error("Contest not found");

  const allRounds = await ContestRound.find({ contestId }).sort({
    roundNumber: 1,
  });
  const rounds = allRounds.filter((round) => !round.isThirdPlacePlayoff);
  const totalRounds = rounds.length;
  const currentRound = parseInt(
    (await (
      await getRedis()
    ).hGet(`contest:${contestId}:meta`, "currentRound")) || "1",
    10,
  );

  const nodes: BracketNode[] = [];
  let thirdPlacePlayoff: BracketNode | undefined;

  for (const round of allRounds) {
    const rooms = await ContestRoom.find({ _id: { $in: round.rooms } }).sort({
      createdAt: 1,
    });
    for (const room of rooms) {
      const teams = [];
      for (const teamId of room.teams) {
        teams.push(
          await ContestTeam.findById(teamId).populate<{
            members: UserRecord[];
          }>({
            path: "members",
            model: User,
            select: "image",
          }),
        );
      }
      const teamIds: [string | null, string | null] = [null, null];
      const teamNames: [string | null, string | null] = [null, null];
      const teamImages: [string | null, string | null] = [null, null];
      const scores: [number, number] = [0, 0];

      for (let i = 0; i < Math.min(teams.length, 2); i++) {
        if (teams[i]) {
          teamIds[i] = toStr(teams[i]!._id);
          teamNames[i] = teams[i]!.name || null;
          scores[i] = teams[i]!.score;

          const firstMember = teams[i]!.members[0];
          teamImages[i] = firstMember?.image || null;
        }
      }

      let winner: string | null = null;
      if (room.status === "ended") {
        if (scores[0] > scores[1]) winner = teamIds[0];
        else if (scores[1] > scores[0]) winner = teamIds[1];
        else if (teamIds[0] && !teamIds[1]) winner = teamIds[0];
      }

      let status: BracketNode["status"] = "pending";
      if (room.status === "ended") {
        if (
          (teamIds[0] === null || teamIds[1] === null) &&
          scores[0] === 0 &&
          scores[1] === 0
        ) {
          status = "bye";
        } else {
          status = "completed";
        }
      } else if (room.status === "active") {
        status = "active";
      } else if (room.status === "waiting") {
        status = "waiting";
      }

      const node: BracketNode = {
        roomId: toStr(room._id),
        roundNumber: round.roundNumber,
        matchIndex: rooms.indexOf(room),
        teams: teamIds,
        teamNames,
        teamImages,
        scores,
        status,
        winner,
        bracketPosition: room.bracketPosition || "",
        isThirdPlacePlayoff: Boolean(round.isThirdPlacePlayoff),
      };
      if (round.isThirdPlacePlayoff) thirdPlacePlayoff = node;
      else nodes.push(node);
    }
  }

  return { contestId, currentRound, totalRounds, nodes, thirdPlacePlayoff };
}

export async function processWalkover(
  roomId: string,
  winnerTeamId: string,
  note: string,
  adminUserId: string,
  deferredEffects?: DeferredBracketEffect[],
) {
  await dbConnect();
  const room = await ContestRoom.findById(roomId);
  if (!room) throw new Error("Room not found");

  const contest = await ContestMatch.findById(room.contestId);
  if (!contest || contest.format !== "bracket")
    throw new Error("Room is not part of a bracket contest");

  room.status = "ended";
  await room.save();

  const winnerTeam = await ContestTeam.findById(winnerTeamId);
  if (winnerTeam) {
    winnerTeam.score = (winnerTeam.score || 0) + 1;
    await winnerTeam.save();
  }

  logger.info("Bracket walkover recorded", {
    operation: "process_walkover",
    roomId,
    winnerTeamId,
  });

  await advanceWinner(
    roomId,
    toStr(contest._id),
    winnerTeamId,
    deferredEffects,
  );

  if (room.currentRoundId) {
    const round = await ContestRound.findById(room.currentRoundId);
    if (round) {
      await checkRoundCompletion(
        toStr(contest._id),
        round.roundNumber,
        deferredEffects,
      );
    }
  }

  const snapshot = await getBracketSnapshot(toStr(contest._id));
  return snapshot;
}
