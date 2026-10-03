import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

import { CONTEST_TIMING } from "@/lib/constants";

import { parseBracketPosition } from "@/lib/contests/bracketLayout";
import {
  buildBracketTopology,
  minimumBracketEntrants,
} from "@/lib/contests/bracketTopology";
import { provisionProblems } from "@/lib/contests/provisioning";
import { configureRoomTiming } from "@/lib/contests/roomTiming";
import { synchronizeRoomRuntime } from "@/lib/contests/roomRuntime";
import { publishContest } from "@/lib/contests/events";
import type { BracketNode, BracketSnapshot } from "@/lib/contests/types";
import { connectMongoDB } from "@/lib/db/mongodb";
import { getRedis } from "@/lib/db/redis";

import ContestMatch, {
  type IBracketEntrant,
  type IContestMatch,
  type IRegistration,
} from "@/models/ContestMatch";
import ContestParticipation from "@/models/ContestParticipation";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestRound from "@/models/ContestRound";
import ContestRoom, {
  type IBracketDestination,
  type IContestRoom,
} from "@/models/ContestRoom";
import ContestTeam, { type IContestTeam } from "@/models/ContestTeam";
import CPUser from "@/models/CPUser";
import User from "@/models/User";

export type DeferredBracketEffect = () => Promise<void>;

export function groupBracketRegistrations(
  registrations: IRegistration[],
  teamSize: number,
) {
  const groups = new Map<
    string,
    { name: string; members: mongoose.Types.ObjectId[] }
  >();
  const seen = new Set<string>();

  for (const registration of registrations) {
    const member = String(registration.userId);

    if (seen.has(member)) {
      throw new Error("Duplicate bracket registration.");
    }

    seen.add(member);

    const name = registration.teamName?.trim() || registration.cfHandle;
    const key = teamSize === 1 ? member : name.toLowerCase();
    const group = groups.get(key) ?? { name, members: [] };

    group.members.push(registration.userId);
    groups.set(key, group);
  }

  return [...groups.values()].filter(
    (group) => group.members.length === teamSize,
  );
}

async function mutateBracket<T>(
  contestId: string,
  deferredEffects: DeferredBracketEffect[] | undefined,
  mutation: (contest: IContestMatch) => Promise<T>,
): Promise<T> {
  await connectMongoDB();

  const run = async (effects: DeferredBracketEffect[]) => {
    // A parent write serializes simultaneous results from different matches
    const contest = await ContestMatch.findOneAndUpdate(
      { _id: contestId, format: "bracket" },
      { $inc: { bracketRevision: 1 } },
      { returnDocument: "after" },
    );

    if (!contest) {
      throw new Error("Bracket contest not found.");
    }

    const result = await mutation(contest);

    effects.push(() => synchronizeBracketRuntime(contestId));

    return result;
  };

  if (deferredEffects) {
    // Admin callers already own the surrounding audit transaction
    return run(deferredEffects);
  }

  const committed = await mongoose.connection.transaction(async () => {
    const effects: DeferredBracketEffect[] = [];

    return { result: await run(effects), effects };
  });

  for (const effect of committed.effects) {
    await effect();
  }

  return committed.result;
}

// Replays restore runtime state without resetting an active match
export async function synchronizeBracketRuntime(contestId: string) {
  const redis = await getRedis();
  const lockKey = `contest:${contestId}:transition_lock`;
  const token = randomUUID();

  if (
    !(await redis.set(lockKey, token, {
      NX: true,
      EX: CONTEST_TIMING.transitionLockSeconds,
    }))
  ) {
    const { reconciliationQueue } = await import("@/lib/contests/queues");

    // A busy lease must delay recovery rather than discard the committed change
    await reconciliationQueue.add(
      "bracket_transition",
      { contestId },
      {
        delay: CONTEST_TIMING.transitionLockSeconds * 1000,
        jobId: `bracket-transition-${contestId}-${token}`,
        removeOnComplete: true,
      },
    );

    return;
  }

  try {
    const contest = await ContestMatch.findById(contestId).lean();

    if (!contest) {
      return;
    }

    const rooms = await ContestRoom.find({ contestId }).lean();
    for (const room of rooms) {
      await synchronizeRoomRuntime(String(room._id));
    }

    const snapshot = await getBracketSnapshot(contestId);

    await redis.hSet(`contest:${contestId}:meta`, {
      format: "bracket",
      status: contest.status,
      currentRound: String(snapshot.currentRound),
    });
    await publishContest(contestId, {
      type: "contest.bracket_update",
      ...snapshot,
    });
  } finally {
    // An expired owner must not release a replacement lease
    await redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
      { keys: [lockKey], arguments: [token] },
    );
  }
}

async function createRoomTeam(
  room: IContestRoom,
  entrant: IBracketEntrant,
  losses = 0,
) {
  const team = await ContestTeam.create({
    roomId: room._id,
    contestId: room.contestId,
    roundId: room.currentRoundId,
    name: entrant.name,
    members: entrant.members,
    teamSize: entrant.members.length,
    score: 0,
    entrantId: entrant.entrantId,
    seed: entrant.seed,
    frozenRating: entrant.rating,
    bracketLosses: losses,
  });

  return team._id;
}

export async function generateBracket(
  contestId: string,
  solvedProblemIds?: Set<string>,
  deferredEffects?: DeferredBracketEffect[],
) {
  await connectMongoDB();

  const preparedContest = await ContestMatch.findOne({
    _id: contestId,
    format: "bracket",
  });
  let allocations: Awaited<ReturnType<typeof provisionProblems>> | undefined;

  if (
    preparedContest?.status === "provisioning" &&
    !preparedContest.bracketGeneratedAt &&
    !preparedContest.cancellationReason
  ) {
    const groups = groupBracketRegistrations(
      preparedContest.registrations ?? [],
      preparedContest.teamSize || 1,
    );
    const type = preparedContest.bracketSettings?.type || "single_elimination";
    const capacity = preparedContest.registrationSettings?.entrantCapacity;

    if (
      capacity &&
      groups.length >= minimumBracketEntrants(type) &&
      groups.length <= capacity
    ) {
      // Fetch external content before holding the bracket transaction open
      allocations = await provisionProblems(
        preparedContest,
        solvedProblemIds ?? new Set(),
        buildBracketTopology(groups.length, type),
      );
    }
  }

  return mutateBracket(contestId, deferredEffects, async (contest) => {
    if (contest.cancellationReason) {
      return getBracketSnapshot(contestId);
    }

    if (contest.bracketGeneratedAt) {
      return getBracketSnapshot(contestId);
    }

    if (contest.status !== "provisioning") {
      throw new Error("Contest must be provisioning to generate a bracket.");
    }

    if (await ContestRoom.exists({ contestId })) {
      throw new Error(
        "Bracket rooms already exist without a completed generation.",
      );
    }

    const type = contest.bracketSettings?.type || "single_elimination";
    const groups = groupBracketRegistrations(
      contest.registrations ?? [],
      contest.teamSize || 1,
    );
    const capacity = contest.registrationSettings?.entrantCapacity;

    if (!capacity) {
      throw new Error("Bracket entrant capacity is required.");
    }

    if (groups.length > capacity) {
      throw new Error("Bracket entrant capacity exceeded.");
    }

    if (groups.length < minimumBracketEntrants(type)) {
      contest.status = "completed";
      contest.winnerName = "No Winner";
      contest.cancellationReason = `Registration closed with ${groups.length} complete entrants (${minimumBracketEntrants(type)} required).`;
      contest.grandFinalState = "complete";
      await contest.save();

      return getBracketSnapshot(contestId);
    }

    if (!allocations || preparedContest?.get("__v") !== contest.get("__v")) {
      throw new Error(
        "Bracket registrations changed during provisioning. Retry generation.",
      );
    }

    // Snapshot team averages once so later rating changes cannot reorder seeds
    const profiles = await CPUser.find({
      userId: { $in: groups.flatMap((group) => group.members) },
    }).lean();
    const ratings = new Map(
      profiles.map((profile) => [
        String(profile.userId),
        profile.cfRating || 0,
      ]),
    );
    const entrants = groups
      .map((group) => ({
        entrantId: new mongoose.Types.ObjectId(),
        ...group,
        seed: 0,
        rating:
          group.members.reduce(
            (sum, member) => sum + (ratings.get(String(member)) ?? 0),
            0,
          ) / group.members.length,
      }))
      .sort(
        (a, b) =>
          b.rating - a.rating ||
          a.members
            .map(String)
            .sort()
            .join()
            .localeCompare(b.members.map(String).sort().join()),
      );

    entrants.forEach((entrant, index) => {
      entrant.seed = index + 1;
    });
    contest.bracketEntrants = entrants;
    contest.bracketGeneratedAt = new Date();

    const topology = buildBracketTopology(entrants.length, type);
    // Allocate every destination before resolving any seeded byes
    const roomIds = new Map(
      topology.matches.map((match) => [
        match.position,
        new mongoose.Types.ObjectId(),
      ]),
    );
    const rounds = new Map<number, mongoose.Types.ObjectId>();

    for (const match of topology.matches) {
      if (!rounds.has(match.roundNumber)) {
        const round = await ContestRound.create({
          contestId,
          roundNumber: match.roundNumber,
          name: match.roundName,
          status: "pending",
          bracketType: match.stage,
          bracketRoundNumber: match.roundIndex + 1,
          rooms: topology.matches
            .filter((other) => other.roundNumber === match.roundNumber)
            .map((other) => roomIds.get(other.position)!),
        });

        rounds.set(match.roundNumber, round._id);
      }

      const destination = (target: typeof match.winnerTo) =>
        target
          ? { roomId: roomIds.get(target.position), slot: target.slot }
          : undefined;
      const room = await ContestRoom.create({
        _id: roomIds.get(match.position),
        contestId,
        name: `${match.roundName} - Match ${match.matchIndex + 1}`,
        currentRoundId: rounds.get(match.roundNumber),
        status: "pending",
        teams: [],
        participants: [],
        bracketPosition: match.position,
        bracketPlayable: match.playable,
        bracketConditional: match.conditional,
        winnerDestination: destination(match.winnerTo),
        loserDestination: destination(match.loserTo),
        bracketSlots: match.sources.map((source) => ({
          source:
            source.kind === "seed"
              ? source
              : { kind: source.kind, roomId: roomIds.get(source.position) },
          resolved: source.kind === "seed",
        })),
      });

      for (let slot = 0; slot < 2; slot++) {
        const source = match.sources[slot];

        if (source.kind === "seed" && source.seed <= entrants.length) {
          room.bracketSlots![slot].teamId = await createRoomTeam(
            room,
            entrants[source.seed - 1],
          );
        }
      }

      room.teams = room.bracketSlots!.flatMap((slot) =>
        slot.teamId ? [slot.teamId] : [],
      );
      await room.save();
    }

    for (const [position, problems] of allocations) {
      await ContestProblemSet.create({
        contestId: contest._id,
        roomId: roomIds.get(position),
        problems,
      });
    }
    await contest.save();
    await settleRooms(contest);

    return getBracketSnapshot(contestId);
  });
}

async function resolveDestination(
  contest: IContestMatch,
  sourceRoom: IContestRoom,
  destination: IBracketDestination | undefined,
  outcome: "winner" | "loser",
  team: IContestTeam | null,
) {
  if (!destination) {
    return;
  }

  const target = await ContestRoom.findOne({
    _id: destination.roomId,
    contestId: contest._id,
  });
  const slot = target?.bracketSlots?.[destination.slot];

  if (
    !target ||
    !slot ||
    String(slot.source.roomId) !== String(sourceRoom._id) ||
    slot.source.kind !== outcome
  ) {
    throw new Error("Bracket destination does not match its source.");
  }

  // Each destination slot accepts exactly one outcome from its recorded source
  if (slot.resolved) {
    throw new Error(
      "Bracket destination already resolved by another transition.",
    );
  }

  slot.resolved = true;

  if (team && !team.isNull) {
    if (!team.entrantId || !team.seed || team.frozenRating === undefined) {
      throw new Error("Frozen entrant data is missing.");
    }

    slot.teamId = await createRoomTeam(
      target,
      {
        entrantId: team.entrantId,
        name: team.name,
        members: team.members,
        seed: team.seed,
        rating: team.frozenRating,
      },
      (team.bracketLosses ?? 0) + (outcome === "loser" ? 1 : 0),
    );
  }

  target.teams = target.bracketSlots!.flatMap((entry) =>
    entry.teamId ? [entry.teamId] : [],
  );
  await target.save();
}

async function resolveMatch(
  contest: IContestMatch,
  room: IContestRoom,
  winnerId: string | null,
  reason?: string,
) {
  if (!room.bracketSlots || room.bracketSlots.length !== 2) {
    throw new Error("Bracket match must have two source slots.");
  }

  // Retried delivery is harmless only when the recorded winner agrees
  if (room.advancementCompletedAt) {
    if ((room.winnerTeamId ? String(room.winnerTeamId) : null) !== winnerId) {
      throw new Error("Match already advanced with a different outcome.");
    }

    return;
  }

  if (
    !room.bracketSlots.every((slot) => slot.resolved) ||
    room.bracketConditional
  ) {
    throw new Error("Match entrants are not resolved.");
  }

  const teams = await ContestTeam.find({
    _id: { $in: room.teams },
    roomId: room._id,
    contestId: contest._id,
  });
  const winner = winnerId
    ? teams.find((team) => String(team._id) === winnerId && !team.isNull)
    : null;

  if (winnerId && !winner) {
    throw new Error("Winner is not an eligible team in this match.");
  }

  if (room.winnerTeamId && String(room.winnerTeamId) !== winnerId) {
    throw new Error("Winner conflicts with the recorded match outcome.");
  }

  const loser = winner
    ? (teams.find((team) => String(team._id) !== winnerId) ?? null)
    : null;

  room.status = "ended";
  room.finalizedAt ??= new Date();
  room.resultMethod ??=
    reason === "walkover" || reason === "admin_nullify"
      ? "admin"
      : reason === "bye"
        ? "bye"
        : reason === "empty_slots"
          ? "empty"
          : "no_show";
  room.actualEndTime ??= new Date();
  room.winnerTeamId = winner?._id;
  room.terminationReason = reason ?? room.terminationReason;
  room.advancementCompletedAt = new Date();
  room.participationRevision += 1;
  room.runtimeSyncPending = true;
  await room.save();
  await ContestParticipation.deleteMany({ roomId: room._id });

  const stage = parseBracketPosition(room.bracketPosition!).stage;

  if (stage === "grand_final") {
    // The upper finalist occupies slot zero regardless of arrival order
    const upperId = room.bracketSlots[0].teamId;
    const resetNeeded =
      winner && loser && !loser.isNull && String(upperId) !== winnerId;

    if (resetNeeded) {
      const reset = await ContestRoom.findOne({
        _id: room.winnerDestination?.roomId,
        contestId: contest._id,
      });

      if (!reset) {
        throw new Error("Grand-final reset is missing.");
      }

      reset.bracketConditional = false;
      await reset.save();
      contest.grandFinalState = "reset_in_progress";
    } else {
      await ContestRoom.updateMany(
        { contestId: contest._id, bracketConditional: true },
        {
          $set: {
            status: "ended",
            terminationReason: "reset_not_needed",
            advancementCompletedAt: new Date(),
          },
        },
      );
      await completeContest(contest, winner ?? null);

      return;
    }
  }

  await resolveDestination(
    contest,
    room,
    room.winnerDestination,
    "winner",
    winner ?? null,
  );
  await resolveDestination(
    contest,
    room,
    room.loserDestination,
    "loser",
    loser,
  );

  if (!room.winnerDestination) {
    await completeContest(contest, winner ?? null);
  } else {
    await contest.save();
  }
}

async function completeContest(
  contest: IContestMatch,
  winner: IContestTeam | null,
) {
  contest.winner = winner?._id;
  contest.winnerName = winner?.name || "No Winner";
  contest.status = "completed";
  contest.grandFinalState = "complete";
  await contest.save();
}

async function settleRooms(contest: IContestMatch) {
  let changed = true;

  while (changed) {
    changed = false;

    const rooms = await ContestRoom.find({
      contestId: contest._id,
      status: "pending",
      bracketConditional: { $ne: true },
    });

    for (const room of rooms) {
      if (!room.bracketSlots?.every((slot) => slot.resolved)) {
        continue;
      }

      const teams = await ContestTeam.find({
        _id: { $in: room.teams },
        isNull: { $ne: true },
      });

      if (teams.length < 2) {
        // Resolved empty slots propagate without creating placeholder teams
        await resolveMatch(
          contest,
          room,
          teams[0] ? String(teams[0]._id) : null,
          teams.length ? "bye" : "empty_slots",
        );
        changed = true;
      } else {
        room.status = "waiting";
        room.participants = teams.flatMap((team) => team.members);
        configureRoomTiming(room, contest);
        await room.save();
      }
    }
  }

  for (const round of await ContestRound.find({ contestId: contest._id })) {
    const rooms = await ContestRoom.find({ _id: { $in: round.rooms } });

    round.status = rooms.every((room) => room.status === "ended")
      ? "completed"
      : rooms.some((room) => room.status !== "pending")
        ? "active"
        : "pending";
    await round.save();
  }
}

export async function advanceWinner(
  roomId: string,
  contestId: string,
  winnerTeamId: string | null,
  deferredEffects?: DeferredBracketEffect[],
) {
  if (!winnerTeamId) {
    return;
  }

  return mutateBracket(contestId, deferredEffects, async (contest) => {
    const room = await ContestRoom.findOne({ _id: roomId, contestId });

    if (!room) {
      throw new Error("Match does not belong to this contest.");
    }

    await resolveMatch(contest, room, winnerTeamId);
    await settleRooms(contest);
  });
}

export async function advanceNullPlayer(
  contestId: string,
  roomId: string,
  deferredEffects?: DeferredBracketEffect[],
) {
  return mutateBracket(contestId, deferredEffects, async (contest) => {
    const room = await ContestRoom.findOne({ _id: roomId, contestId });

    if (!room) {
      throw new Error("Match does not belong to this contest.");
    }

    await resolveMatch(
      contest,
      room,
      null,
      room.terminationReason || "both_absent",
    );
    await settleRooms(contest);
  });
}

export async function checkRoundCompletion(
  contestId: string,
  _roundNumber: number,
  deferredEffects?: DeferredBracketEffect[],
) {
  return mutateBracket(contestId, deferredEffects, async (contest) => {
    await settleRooms(contest);
  });
}

export async function getBracketSnapshot(
  contestId: string,
): Promise<BracketSnapshot> {
  await connectMongoDB();

  const contest = await ContestMatch.findById(contestId).lean();

  if (!contest) {
    throw new Error("Contest not found.");
  }

  const rounds = await ContestRound.find({ contestId })
    .sort({ roundNumber: 1 })
    .lean();
  const rooms = await ContestRoom.find({ contestId }).lean();
  const teams = await ContestTeam.find({
    _id: { $in: rooms.flatMap((room) => room.teams) },
  }).lean();
  const teamMap = new Map(teams.map((team) => [String(team._id), team]));
  const users = await User.find({
    _id: { $in: teams.flatMap((team) => team.members) },
  })
    .select("image")
    .lean();
  const images = new Map(users.map((user) => [String(user._id), user.image]));
  const nodes: BracketNode[] = [];

  for (const round of rounds) {
    for (const room of rooms
      .filter((room) => String(room.currentRoundId) === String(round._id))
      .sort(
        (a, b) =>
          parseBracketPosition(a.bracketPosition!).matchIndex -
          parseBracketPosition(b.bracketPosition!).matchIndex,
      )) {
      if (room.terminationReason === "reset_not_needed") {
        continue;
      }

      const ids = room.bracketSlots!.map((slot) => slot.teamId);
      const pair = [0, 1].map((index) =>
        ids[index] ? teamMap.get(String(ids[index])) : undefined,
      );
      const destination = (value: typeof room.winnerDestination) =>
        value ? { roomId: String(value.roomId), slot: value.slot } : undefined;

      nodes.push({
        winnerDestination: destination(room.winnerDestination),
        loserDestination: destination(room.loserDestination),
        roomId: String(room._id),
        roundNumber: round.roundNumber,
        roundName: round.name,
        matchIndex: parseBracketPosition(room.bracketPosition!).matchIndex,
        bracketType: parseBracketPosition(room.bracketPosition!).stage,
        bracketPosition: room.bracketPosition!,
        teams: [
          pair[0] ? String(pair[0]._id) : null,
          pair[1] ? String(pair[1]._id) : null,
        ],
        teamNames: [pair[0]?.name ?? null, pair[1]?.name ?? null],
        teamImages: [
          images.get(String(pair[0]?.members[0])) ?? null,
          images.get(String(pair[1]?.members[0])) ?? null,
        ],
        teamIsNull: [Boolean(pair[0]?.isNull), Boolean(pair[1]?.isNull)],
        scores: [pair[0]?.score ?? 0, pair[1]?.score ?? 0],
        seeds: [pair[0]?.seed ?? null, pair[1]?.seed ?? null],
        slotsResolved: [
          room.bracketSlots![0].resolved,
          room.bracketSlots![1].resolved,
        ],
        winner: room.winnerTeamId ? String(room.winnerTeamId) : null,
        status:
          room.status === "ended"
            ? room.terminationReason === "bye"
              ? "bye"
              : "completed"
            : room.status === "active"
              ? "active"
              : room.status === "waiting"
                ? "waiting"
                : "pending",
        walkover: room.terminationReason === "walkover",
        terminationReason: room.terminationReason,
      });
    }
  }

  return {
    contestId,
    bracketType: contest.bracketSettings?.type || "single_elimination",
    grandFinalState: contest.grandFinalState,
    currentRound:
      rounds.find((round) => round.status !== "completed")?.roundNumber ??
      rounds.length,
    currentRoundName:
      rounds.find((round) => round.status !== "completed")?.name ??
      rounds.at(-1)?.name,
    totalRounds: rounds.length,
    upperRounds: rounds.filter((round) => round.bracketType === "upper").length,
    lowerRounds: rounds.filter((round) => round.bracketType === "lower").length,
    nodes,
  };
}

export async function processWalkover(
  roomId: string,
  winnerTeamId: string,
  _note: string,
  _adminUserId: string,
  deferredEffects?: DeferredBracketEffect[],
) {
  await connectMongoDB();

  const room = await ContestRoom.findById(roomId);

  if (!room) {
    throw new Error("Room not found.");
  }

  return mutateBracket(
    String(room.contestId),
    deferredEffects,
    async (contest) => {
      const current = await ContestRoom.findById(roomId);

      await resolveMatch(contest, current!, winnerTeamId, "walkover");
      await settleRooms(contest);

      return getBracketSnapshot(String(contest._id));
    },
  );
}

export async function processNullifyMatch(
  roomId: string,
  _note: string,
  _adminUserId: string,
  deferredEffects?: DeferredBracketEffect[],
) {
  await connectMongoDB();

  const room = await ContestRoom.findById(roomId);

  if (!room) {
    throw new Error("Room not found.");
  }

  return mutateBracket(
    String(room.contestId),
    deferredEffects,
    async (contest) => {
      const current = await ContestRoom.findById(roomId);

      await resolveMatch(contest, current!, null, "admin_nullify");
      await settleRooms(contest);

      return getBracketSnapshot(String(contest._id));
    },
  );
}
