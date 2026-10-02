import mongoose from "mongoose";

import { err, ok, type AppResult } from "@/lib/api/result";
import { connectMongoDB } from "@/lib/db/mongodb";
import { synchronizeRoomRuntime } from "@/lib/contests/roomRuntime";

import ContestMatch from "@/models/ContestMatch";
import { initializeMatchProblems } from "@/lib/contests/matchScoring";
import ContestProblemSet from "@/models/ContestProblemSet";

import ContestParticipation from "@/models/ContestParticipation";
import ContestRoom, { type IContestRoom } from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";

export interface ParticipationResult {
  status: IContestRoom["status"];
  readyUserIds: string[];
  admittedUserIds: string[];
}

function participationResult(room: IContestRoom): ParticipationResult {
  return {
    status: room.status,
    readyUserIds: room.readyUserIds.map(String),
    admittedUserIds: room.admissions.map((admission) =>
      String(admission.userId),
    ),
  };
}

// Release only after a durable ending and never in response to browser presence
export async function releaseRoomParticipation(roomId: string) {
  await ContestParticipation.deleteMany({ roomId });
}

export async function readyOrEnterRoom(
  roomId: string,
  userId?: string,
  at?: number,
): Promise<AppResult<ParticipationResult>> {
  await connectMongoDB();

  const reference = await ContestRoom.findById(roomId)
    .select("contestId")
    .lean();

  if (!reference) {
    return err("NOT_FOUND", "Room not found.");
  }

  // A duplicate claim can race across contests so retry with the winning claim visible
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const committed = await mongoose.connection.transaction(async () => {
        const effects: Array<() => Promise<void>> = [];
        const now = at ?? Date.now();
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

        if (!contest || !room) {
          return { result: err("NOT_FOUND", "Room not found."), effects };
        }

        const teams = await ContestTeam.find({
          _id: { $in: room.teams },
          roomId,
          contestId: contest._id,
        });
        const userTeam = userId
          ? teams.find((team) =>
              team.members.some((member) => String(member) === userId),
            )
          : undefined;

        if (
          userId &&
          (!userTeam ||
            !room.participants.some((member) => String(member) === userId))
        ) {
          return {
            result: err("FORBIDDEN", "Not a participant in this room."),
            effects,
          };
        }

        if (room.status === "ended" || room.status === "pending") {
          return {
            result: userId
              ? err("CONFLICT", "This room is not open for entry.")
              : ok(participationResult(room)),
            effects,
          };
        }

        if (
          !room.readyOpensAt ||
          !room.readyDeadline ||
          !room.durationSeconds
        ) {
          throw new Error("Room readiness timing is not configured.");
        }

        const claims = await ContestParticipation.find({
          _id: { $in: room.participants },
        }).lean();
        const occupied = new Set(
          claims
            .filter((claim) => String(claim.roomId) !== roomId)
            .map((claim) => String(claim._id)),
        );
        const deadlineReached = now >= room.readyDeadline.getTime();
        let result: AppResult<ParticipationResult> | undefined;

        if (room.status === "active") {
          if (!userId) {
            return { result: ok(participationResult(room)), effects };
          }

          if (
            room.gameplayEndedAt ||
            !room.matchDeadline ||
            now >= room.matchDeadline.getTime()
          ) {
            return {
              result: err("CONFLICT", "This match has reached its deadline."),
              effects,
            };
          }

          if (occupied.has(userId)) {
            return {
              result: err(
                "CONFLICT",
                "You are already playing another live match. You can enter after it ends.",
              ),
              effects,
            };
          }

          if (
            !room.playingTeamIds.some(
              (id) => String(id) === String(userTeam!._id),
            )
          ) {
            return {
              result: err("CONFLICT", "Your team missed the ready deadline."),
              effects,
            };
          }

          if (
            !room.admissions.some(
              (admission) => String(admission.userId) === userId,
            )
          ) {
            const admission = {
              userId: new mongoose.Types.ObjectId(userId),
              teamId: userTeam!._id,
              admittedAt: new Date(now),
            };

            await ContestParticipation.create({
              _id: admission.userId,
              roomId,
              contestId: contest._id,
              teamId: admission.teamId,
              admittedAt: admission.admittedAt,
            });
            room.admissions.push(admission);
          }
        } else {
          if (now < room.readyOpensAt.getTime()) {
            return {
              result: userId
                ? err("CONFLICT", "Readiness opens at the scheduled start.")
                : ok(participationResult(room)),
              effects,
            };
          }

          // A delayed worker must still exclude people who were playing at this deadline
          if (deadlineReached) {
            const overlapping = await ContestRoom.find({
              _id: { $ne: room._id },
              admissions: {
                $elemMatch: {
                  userId: { $in: room.readyUserIds },
                  admittedAt: { $lte: room.readyDeadline },
                },
              },
              $or: [
                { status: "active" },
                { actualEndTime: { $gte: room.readyDeadline } },
              ],
            })
              .select("admissions")
              .lean();

            for (const other of overlapping) {
              for (const admission of other.admissions) {
                if (admission.admittedAt <= room.readyDeadline)
                  occupied.add(String(admission.userId));
              }
            }
          }

          // Declarations do not reserve a person and must be checked again at activation
          room.readyUserIds = room.readyUserIds.filter(
            (id) => !occupied.has(String(id)),
          );

          if (userId && !deadlineReached) {
            if (occupied.has(userId)) {
              result = err(
                "CONFLICT",
                "You are already playing another live match. This room's ready deadline continues.",
              );
            } else if (!room.readyUserIds.some((id) => String(id) === userId)) {
              room.readyUserIds.push(new mongoose.Types.ObjectId(userId));
            }
          }

          const ready = new Set(room.readyUserIds.map(String));
          const availableTeams = teams.filter((team) =>
            team.members.some((member) => ready.has(String(member))),
          );
          const allReady =
            teams.length >= 2 &&
            teams.every(
              (team) =>
                team.members.length > 0 &&
                team.members.every((member) => ready.has(String(member))),
            );

          if (allReady || deadlineReached) {
            if (availableTeams.length < 2) {
              room.status = "ended";
              room.actualEndTime = new Date(now);
              room.finalizedAt = new Date(now);
              room.resultMethod = "no_show";
              room.terminationReason =
                availableTeams.length === 1 ? "opponent_absent" : "both_absent";
              room.winnerTeamId = availableTeams[0]?._id;
              room.runtimeSyncPending = true;
              await room.save();

              if (contest.format === "bracket") {
                const { advanceWinner, advanceNullPlayer } =
                  await import("@/lib/contests/bracket");

                if (room.winnerTeamId) {
                  await advanceWinner(
                    roomId,
                    String(contest._id),
                    String(room.winnerTeamId),
                    effects,
                  );
                } else {
                  await advanceNullPlayer(String(contest._id), roomId, effects);
                }
              } else {
                await releaseRoomParticipation(roomId);
                const remaining = await ContestRoom.exists({
                  contestId: contest._id,
                  status: { $ne: "ended" },
                });

                if (!remaining) {
                  contest.status = "completed";
                  contest.endTime = new Date(now);
                  await contest.save();
                }
              }
            } else {
              room.status = "active";
              room.actualStartTime = new Date(now);
              room.matchDeadline = new Date(now + room.durationSeconds * 1000);
              room.playingTeamIds = availableTeams.map((team) => team._id);
              room.admissions = availableTeams.flatMap((team) =>
                team.members
                  .filter((member) => ready.has(String(member)))
                  .map((member) => ({
                    userId: member,
                    teamId: team._id,
                    admittedAt: new Date(now),
                  })),
              );

              // Unique user keys arbitrate starts in different contest transactions
              await ContestParticipation.insertMany(
                room.admissions
                  .map((admission) => ({
                    _id: admission.userId,
                    teamId: admission.teamId,
                    roomId,
                    contestId: contest._id,
                    admittedAt: admission.admittedAt,
                  }))
                  .sort((a, b) => String(a._id).localeCompare(String(b._id))),
              );

              const problemSet = await ContestProblemSet.findOne({ roomId });

              initializeMatchProblems(
                room,
                problemSet?.problems ?? [],
                contest.mode,
              );
              room.scoreStats = availableTeams.map((team) => ({
                teamId: String(team._id),
                score: 0,
                solveTimeMs: 0,
                wrongSubmissions: 0,
                penaltyTimeMs: 0,
                lastSolveAt: 0,
                seed: team.seed,
              }));

              contest.status = "active";
              await contest.save();
            }
          }

          if (
            userId &&
            deadlineReached &&
            !room.admissions.some(
              (admission) => String(admission.userId) === userId,
            )
          ) {
            result = err(
              "CONFLICT",
              room.status === "active"
                ? "The match has started. Enter now to join your team."
                : "The ready deadline has passed.",
            );
          }
        }

        room.runtimeSyncPending = true;
        await room.save();
        effects.push(() => synchronizeRoomRuntime(roomId));

        return { result: result ?? ok(participationResult(room)), effects };
      });

      for (const effect of committed.effects) {
        await effect();
      }

      return committed.result;
    } catch (error) {
      if (
        !(error instanceof mongoose.mongo.MongoServerError) ||
        error.code !== 11000
      ) {
        throw error;
      }
    }
  }

  return err(
    "CONFLICT",
    "Another match is starting for a member of this room. Try again.",
  );
}
