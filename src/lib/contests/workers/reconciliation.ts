import { type Job, Worker } from "bullmq";
import mongoose from "mongoose";

import {
  readyOrEnterRoom,
  finishRoomParticipation,
} from "@/lib/contests/participation";
import {
  synchronizeRoomRuntime,
  recoverRoomParticipation,
} from "@/lib/contests/roomRuntime";
import { configureRoomTiming } from "@/lib/contests/roomTiming";
import { publishRoom } from "@/lib/contests/events";
import {
  contestSubmissionEventSchema,
  parseContestRoomProblems,
  reconciliationJobDataSchema,
  type ContestRoomState,
  type ReconciliationJobData,
  type ReconciliationJobName,
} from "@/lib/contests/runtime";
import { workerEnv } from "@/lib/env/worker";
import { connectMongoDB } from "@/lib/db/mongodb";
import { notify } from "@/lib/notifications/service";
import { bullMqConnection } from "@/lib/queues/bullMq";
import { getRedis } from "@/lib/db/redis";
import { logger } from "@/lib/telemetry/logger";
import { fetchContestProblemContent } from "@/lib/contests/problemContent";
import CPUser from "@/models/CPUser";
import ContestMatch from "@/models/ContestMatch";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestQuestion from "@/models/ContestQuestion";
import ContestRoom from "@/models/ContestRoom";
import ContestRound from "@/models/ContestRound";
import ContestSubmission from "@/models/ContestSubmission";
import ContestTeam from "@/models/ContestTeam";

async function determineWinner(
  redis: Awaited<ReturnType<typeof getRedis>>,
  roomId: string,
  teams: string[],
  stateObj: ContestRoomState,
): Promise<{ winnerId: string | null; teamScores: Record<string, number> }> {
  let winnerId: string | null = null;

  interface TeamStats {
    id: string;
    score: number;
    penaltyTime: number;
    lastSolveTime: number;
    solveTimeSum: number;
    wrongSubs: number;
    avgRating: number;
  }

  const teamStats: Record<string, TeamStats> = {};
  const isArena = stateObj.type === "arena";

  for (const tId of teams) {
    const scoreStr = await redis.zScore(`room:${roomId}:scores`, tId);
    const score = scoreStr ? parseFloat(scoreStr.toString()) : 0;

    const penaltyStr = await redis.zScore(`room:${roomId}:penalty_time`, tId);
    const penaltyTime = penaltyStr ? parseFloat(penaltyStr.toString()) : 0;

    const lastSolveStr = await redis.hGet(`room:${roomId}:last_solve`, tId);
    const lastSolveTime = parseInt(lastSolveStr || "0", 10);

    const solveTimeStr = await redis.zScore(`room:${roomId}:solve_times`, tId);
    const solveTimeSum = solveTimeStr ? parseFloat(solveTimeStr.toString()) : 0;

    const wrongSubs = await redis.sCard(`room:${roomId}:wrong_subs:${tId}`);

    const members = await redis.sMembers(`team:${tId}:users`);
    let totalRating = 0;
    let validMembers = 0;

    for (const mId of members) {
      const cpUser = await CPUser.findOne({ userId: mId });

      if (cpUser && cpUser.cfRating) {
        totalRating += cpUser.cfRating;
        validMembers++;
      }
    }

    const avgRating = validMembers > 0 ? totalRating / validMembers : 0;

    teamStats[tId] = {
      id: tId,
      score,
      penaltyTime,
      lastSolveTime,
      solveTimeSum,
      wrongSubs,
      avgRating,
    };
  }

  const sortedTeams = teams
    .map((tId) => teamStats[tId])
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      if (isArena) {
        if (a.penaltyTime !== b.penaltyTime)
          return a.penaltyTime - b.penaltyTime;

        if (a.lastSolveTime !== b.lastSolveTime)
          return a.lastSolveTime - b.lastSolveTime;
      } else {
        if (a.solveTimeSum !== b.solveTimeSum)
          return a.solveTimeSum - b.solveTimeSum;

        if (a.wrongSubs !== b.wrongSubs) return a.wrongSubs - b.wrongSubs;
      }

      return a.id.localeCompare(b.id);
    });

  if (sortedTeams.length > 0) {
    winnerId = sortedTeams[0].id;
  }

  const teamScores: Record<string, number> = {};

  for (const t of sortedTeams) {
    teamScores[t.id] = t.score;
  }

  return { winnerId, teamScores };
}

export const reconciliationWorker = new Worker<
  ReconciliationJobData,
  void,
  ReconciliationJobName
>(
  "reconciliation_queue",
  async (job: Job<ReconciliationJobData, void, ReconciliationJobName>) => {
    logger.info(
      `[reconciliationWorker] Processing job ${job.id} (name: ${job.name})`,
      job.data,
    );

    const { roomId, contestId, trigger } = reconciliationJobDataSchema.parse(
      job.data,
    );
    const redis = await getRedis();

    await connectMongoDB();

    if (job.name === "recover_participation") {
      await recoverRoomParticipation();

      return;
    }

    if (job.name === "ready_timeout") {
      const result = await readyOrEnterRoom(roomId);

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return;
    }

    if (job.name === "bracket_transition") {
      const { synchronizeBracketRuntime } =
        await import("@/lib/contests/bracket");

      await synchronizeBracketRuntime(contestId);

      return;
    }

    // Handle starting registration for scheduled brackets
    if (job.name === "start_registration") {
      const contest = await ContestMatch.findById(contestId);

      if (contest && contest.status === "draft") {
        contest.status = "registration";
        await contest.save();
        logger.info(
          `[reconciliationWorker] Started registration for contest ${contestId}`,
        );
      }

      return;
    }

    // Handle checking contest start
    if (job.name === "check_start") {
      const contest = await ContestMatch.findById(contestId);

      if (!contest) return;

      // Bracket tournaments: generate bracket here (single entry point)
      if (contest.format === "bracket") {
        if (contest.status === "completed" || contest.status === "active")
          return;

        contest.status = "provisioning";
        await contest.save();

        const bracketUserIds = (contest.registrations || []).map(
          (registration) => registration.userId.toString(),
        );

        // Bulk selection excludes recently solved problems for each entrant
        if (contest.problemSelectionMode === "bulk") {
          const { fetchCodeforcesUserStatus } =
            await import("@/lib/platforms/codeforces");

          for (const uid of bracketUserIds) {
            const cpUser = await CPUser.findOne({ userId: uid });

            if (!cpUser || !cpUser.cfHandle) continue;

            const solvedProblems = cpUser.solvedProblems || [];
            let latestSolvedMs = 0;

            for (const sp of solvedProblems) {
              const ts = sp.solvedAt ? new Date(sp.solvedAt).getTime() : 0;

              if (ts > latestSolvedMs) latestSolvedMs = ts;
            }

            try {
              const existingSolvedIds = new Set(
                solvedProblems.map((problem) => problem.problemId),
              );
              const newSolves: Array<{ problemId: string; solvedAt: Date }> =
                [];

              let currentFrom = 1;
              const chunkSize = 200;
              let keepFetching = true;

              while (keepFetching) {
                const submissions = await fetchCodeforcesUserStatus(
                  cpUser.cfHandle,
                  chunkSize,
                  currentFrom,
                );

                for (const sub of submissions) {
                  if (
                    sub.verdict === "OK" &&
                    sub.problem.contestId &&
                    sub.problem.index &&
                    sub.creationTimeSeconds * 1000 > latestSolvedMs
                  ) {
                    const pid = `${sub.problem.contestId}${sub.problem.index}`;

                    if (!existingSolvedIds.has(pid)) {
                      newSolves.push({
                        problemId: pid,
                        solvedAt: new Date(sub.creationTimeSeconds * 1000),
                      });
                      existingSolvedIds.add(pid);
                    }
                  }
                }

                // Check if we need to fetch the next chunk
                if (submissions.length < chunkSize) {
                  keepFetching = false; // no more submissions available
                } else {
                  // If the very last (oldest) submission in this chunk is still newer than latestSolvedMs, fetch more
                  const lastSub = submissions[submissions.length - 1];

                  if (
                    lastSub &&
                    lastSub.creationTimeSeconds * 1000 > latestSolvedMs
                  ) {
                    currentFrom += chunkSize;
                  } else {
                    keepFetching = false;
                  }
                }
              }

              if (newSolves.length > 0) {
                await CPUser.findByIdAndUpdate(cpUser._id, {
                  $push: { solvedProblems: { $each: newSolves } },
                });
                logger.info("Bracket solve history refreshed", {
                  worker: "reconciliationWorker",
                  operation: "refresh_solve_history",
                  solvedCount: newSolves.length,
                });
              }
            } catch (cfErr: unknown) {
              logger.warn("Bracket solve-history fetch failed", {
                worker: "reconciliationWorker",
                operation: "fetch_solve_history",
                err: cfErr,
              });
            }
          }
        } // End of problemSelectionMode === "bulk" check

        // Build solved union from refreshed CPUser docs
        const bracketRefreshedUsers = await CPUser.find({
          userId: { $in: bracketUserIds },
        });
        const bracketSolvedIds = new Set<string>(
          bracketRefreshedUsers.flatMap((u) =>
            (u.solvedProblems || []).map((problem) => problem.problemId),
          ),
        );

        try {
          const { generateBracket } = await import("@/lib/contests/bracket");

          await generateBracket(contestId, bracketSolvedIds);

          const generatedContest =
            await ContestMatch.findById(contestId).lean();

          if (generatedContest?.cancellationReason) {
            const creator = await CPUser.findById(contest.creatorId);

            if (creator?.userId) {
              await notify({
                userId: String(creator.userId),
                type: "announcement",
                title: "Tournament Cancelled",
                message: generatedContest.cancellationReason,
                link: "/internal/contests",
              });
            }

            return;
          }

          const startTimeMs = contest.startTime
            ? contest.startTime.getTime()
            : Date.now();
          const preStartSeconds = workerEnv.ROOM_PRE_START_SECONDS;
          const delayToStart = Math.max(
            0,
            startTimeMs - Date.now() - preStartSeconds * 1000,
          );

          const { reconciliationQueue } = await import("@/lib/contests/queues");

          await reconciliationQueue.add(
            "activate_bracket",
            { contestId: contestId.toString() },
            { delay: delayToStart, jobId: `activate-bracket-${contestId}` },
          );

          logger.info(
            `[reconciliationWorker] check_start: bracket ${contestId} generated. Scheduled activate_bracket in ${delayToStart}ms.`,
          );
        } catch (err: unknown) {
          logger.error(
            `[reconciliationWorker] check_start: bracket generation failed for ${contestId}:`,
            err,
          );
          // Preserve the contest and retry
          throw err;
        }

        return;
      }

      // Non-bracket contests: existing team-grouping + provisioning logic

      // Group registrations into teams
      const teamsMap = new Map<string, string[]>();
      const regs = contest.registrations || [];

      for (const r of regs) {
        const tName = r.teamName || r.cfHandle || r.userId.toString();

        if (!teamsMap.has(tName)) {
          teamsMap.set(tName, []);
        }

        teamsMap.get(tName)?.push(r.userId.toString());
      }

      // Determine required team size
      const requiredTeamSize =
        contest.format === "team-tournament" ? contest.teamSize || 3 : 1;

      // Check if any team doesn't meet the required size
      const invalidTeams = Array.from(teamsMap.entries()).filter(
        ([name, members]) => members.length !== requiredTeamSize,
      );

      if (invalidTeams.length > 0) {
        logger.info(
          `[reconciliationWorker] Contest ${contestId} has incomplete teams. Canceling.`,
        );
        await ContestMatch.findByIdAndDelete(contestId);

        // Notify creator
        const creator = await CPUser.findById(contest.creatorId);

        if (creator && creator.userId) {
          await notify({
            userId: String(creator.userId),
            type: "announcement",
            title: "Contest Cancelled",
            message: `Your contest '${contest.name}' was cancelled because some registered teams were incomplete.`,
            link: "/internal/contests",
          });
        }

        return;
      }

      const validTeams = Array.from(teamsMap.entries());

      if (validTeams.length < 2) {
        logger.info(
          `[reconciliationWorker] Contest ${contestId} did not meet minimum registration requirements. Canceling.`,
        );
        await ContestMatch.findByIdAndDelete(contestId);

        // Notify creator
        const creator = await CPUser.findById(contest.creatorId);

        if (creator && creator.userId) {
          await notify({
            userId: String(creator.userId),
            type: "announcement",
            title: "Contest Cancelled",
            message: `Your contest '${contest.name}' was cancelled due to insufficient registrations.`,
            link: "/internal/contests",
          });
        }

        return;
      }

      // Transition to provisioning before potentially slow problem selection logic
      contest.status = "provisioning";
      await contest.save();

      // Provision room
      const problemCount = contest.bulkProblemCount || 3;
      const minRating = Math.max(contest.bulkRatingMin || 800, 1);
      const maxRating = contest.bulkRatingMax || 1200;
      const minContestId = contest.bulkMinContestId || 0;

      const allUserIds = validTeams.flatMap((t) => t[1]);

      // Refresh solved problems only when selecting from the bulk problem bank
      if (contest.problemSelectionMode === "bulk") {
        const { fetchCodeforcesUserStatus } =
          await import("@/lib/platforms/codeforces");

        for (const uid of allUserIds) {
          const cpUser = await CPUser.findOne({ userId: uid });

          if (!cpUser || !cpUser.cfHandle) continue;

          // Find the timestamp of the most recently recorded solve
          const solvedProblems = cpUser.solvedProblems || [];
          let latestSolvedMs = 0;

          for (const sp of solvedProblems) {
            const ts = sp.solvedAt ? new Date(sp.solvedAt).getTime() : 0;

            if (ts > latestSolvedMs) latestSolvedMs = ts;
          }

          try {
            const submissions = await fetchCodeforcesUserStatus(
              cpUser.cfHandle,
              200,
            );
            const existingSolvedIds = new Set(
              solvedProblems.map((problem) => problem.problemId),
            );
            const newSolves: Array<{ problemId: string; solvedAt: Date }> = [];

            for (const sub of submissions) {
              if (
                sub.verdict === "OK" &&
                sub.problem.contestId &&
                sub.problem.index &&
                sub.creationTimeSeconds * 1000 > latestSolvedMs
              ) {
                const pid = `${sub.problem.contestId}${sub.problem.index}`;

                if (!existingSolvedIds.has(pid)) {
                  newSolves.push({
                    problemId: pid,
                    solvedAt: new Date(sub.creationTimeSeconds * 1000),
                  });
                  existingSolvedIds.add(pid);
                }
              }
            }

            if (newSolves.length > 0) {
              await CPUser.findByIdAndUpdate(cpUser._id, {
                $push: { solvedProblems: { $each: newSolves } },
              });
              logger.info("Contest solve history refreshed", {
                worker: "reconciliationWorker",
                operation: "refresh_solve_history",
                solvedCount: newSolves.length,
              });
            }
          } catch (cfErr: unknown) {
            logger.warn("Contest solve-history fetch failed", {
              worker: "reconciliationWorker",
              operation: "fetch_solve_history",
              err: cfErr,
            });
            // Non-fatal: continue with existing DB data for this user
          }
        }
      }

      // Build union of all solved problem IDs from the (now refreshed) CPUser docs
      const refreshedUsers = await CPUser.find({ userId: { $in: allUserIds } });
      const solvedProblemIds = new Set<string>(
        refreshedUsers.flatMap((u) =>
          (u.solvedProblems || []).map((problem) => problem.problemId),
        ),
      );

      let availableProblems: Array<{
        problemId: string;
        name: string;
        rating?: number;
        points?: number;
        timeLimitMinutes?: number;
      }> = [];

      if (contest.problemSelectionMode === "test") {
        availableProblems = [
          { problemId: "4A", name: "Watermelon", rating: 800 },
          { problemId: "1A", name: "Theatre Square", rating: 1000 },
          { problemId: "158A", name: "Next Round", rating: 800 },
        ].slice(0, problemCount || 2);
      } else if (contest.problemSelectionMode === "fine-tuned") {
        const slots = contest.problemSlots || [];
        const slotIds = slots
          .map((slot) => slot.problemId)
          .filter((problemId): problemId is string => Boolean(problemId));
        const questions = await ContestQuestion.find({
          problemId: { $in: slotIds },
        });

        for (const slot of slots) {
          if (!slot.problemId) continue;

          const q = questions.find((q) => q.problemId === slot.problemId);

          if (q) {
            availableProblems.push({
              problemId: q.problemId,
              name: q.name,
              rating: q.rating,
              points: slot.points,
              timeLimitMinutes: slot.timeLimitMinutes,
            });
          } else {
            availableProblems.push({
              problemId: slot.problemId,
              name: `Problem ${slot.problemId}`,
              rating: 0,
              points: slot.points,
              timeLimitMinutes: slot.timeLimitMinutes,
            });
          }
        }
      } else {
        availableProblems = await ContestQuestion.aggregate<{
          problemId: string;
          name: string;
          rating?: number;
          points?: number;
          timeLimitMinutes?: number;
        }>([
          {
            $match: {
              rating: {
                $exists: true,
                $ne: null,
                $gt: 0,
                $gte: minRating,
                $lte: maxRating,
              },
              ...(minContestId > 0
                ? { contestId: { $gte: minContestId } }
                : {}),
              problemId: { $nin: Array.from(solvedProblemIds) },
            },
          },
          { $sample: { size: problemCount } },
          { $sort: { rating: 1 } },
        ]);
      }

      if (availableProblems.length === 0) {
        logger.info(
          `[reconciliationWorker] check_start: 0 available problems for contest ${contestId}. Canceling.`,
        );
        await ContestMatch.findByIdAndDelete(contestId);

        const creator = await CPUser.findById(contest.creatorId);

        if (creator && creator.userId) {
          await notify({
            userId: String(creator.userId),
            type: "announcement",
            title: "Contest Failed",
            message: `Your contest '${contest.name}' failed because no suitable problems were found.`,
            link: "/internal/contests",
          });
        }

        return;
      }

      if (availableProblems.length < problemCount) {
        logger.warn(
          `[reconciliationWorker] Insufficient problems for contest ${contestId}. Creating anyway with fewer problems.`,
        );
      }

      const problemsWithContent = await Promise.all(
        availableProblems.map(async (problem) => ({
          problem,
          content: await fetchContestProblemContent(problem),
        })),
      );

      const room = new ContestRoom({
        contestId: contest._id,
        name: `Room for ${contest.name}`,
        status: "pending", // Room is hidden until startTime
        participants: allUserIds,
        currentProblemIndex: 0,
        firstSolvers: [],
      });

      const problemSet = new ContestProblemSet({
        contestId: contest._id,
        roomId: room._id,
        problems: problemsWithContent.map(({ problem, content }) => ({
          platform: "codeforces",
          problemId: problem.problemId,
          name: content?.title || problem.name,
          rating: problem.rating,
          points:
            problem.points ??
            (problem.rating ? Math.floor(problem.rating / 10) : 100),
          timeLimitMinutes: problem.timeLimitMinutes,
          ...content,
        })),
      });

      const teamSize = contest.teamSize || 1;
      const createdTeams = [];

      for (const t of validTeams) {
        const team = new ContestTeam({
          contestId: contest._id,
          roomId: room._id,
          name: t[0],
          members: t[1],
          teamSize,
          score: 0,
        });

        await team.save();
        createdTeams.push(team);
      }

      room.teams = createdTeams.map((team) => team._id);
      configureRoomTiming(room, contest);

      await room.save();
      await problemSet.save();

      const newRoomId = room._id.toString();

      const redisProblems = problemsWithContent.map(({ problem, content }) =>
        JSON.stringify({
          problemId: problem.problemId,
          name: content?.title || problem.name,
          rating: problem.rating,
          points:
            problem.points ??
            (problem.rating ? Math.floor(problem.rating / 10) : 100),
          timeLimitMinutes: problem.timeLimitMinutes,
          revealedAt: null,
          ...content,
        }),
      );

      await redis.del(`room:${newRoomId}:problems`);

      if (redisProblems.length > 0) {
        await redis.rPush(`room:${newRoomId}:problems`, redisProblems);
      }

      const durationSec = room.durationSeconds!;

      const stateObj: Record<string, string | number> = {
        status: "pending",
        type: contest.mode || "blitz",
        startTime: "", // Empty for now, set when all ready
        timeLimit: durationSec.toString(),
        contestId: contestId.toString(),
      };

      if (contest.perProblemDurationMinutes) {
        stateObj.problemTimeLimit = (
          contest.perProblemDurationMinutes * 60
        ).toString();
      }

      if (contest.mode !== "arena") {
        stateObj.currentProblem = 0;
      }

      await redis.hSet(`room:${newRoomId}:state`, stateObj);
      await redis.sAdd(
        `room:${newRoomId}:teams`,
        createdTeams.map((team) => team._id.toString()),
      );

      for (const t of createdTeams) {
        const tId = t._id.toString();

        await redis.hSet(`team:${tId}:meta`, { name: t.name, score: 0 });
        await redis.sAdd(
          `team:${tId}:users`,
          t.members.map((member) => member.toString()),
        );
      }

      await redis.sAdd(`contest:${contestId}:rooms`, newRoomId);

      // Open the room before start so the client can enter it on schedule
      const { reconciliationQueue } = await import("@/lib/contests/queues");
      const startTimeMs = contest.startTime
        ? contest.startTime.getTime()
        : Date.now();
      const preStartSeconds = workerEnv.ROOM_PRE_START_SECONDS;
      const delayToStart = Math.max(
        0,
        startTimeMs - Date.now() - preStartSeconds * 1000,
      );

      await reconciliationQueue.add(
        "start_waiting_room",
        {
          roomId: newRoomId,
          contestId: contestId.toString(),
        },
        { delay: delayToStart, jobId: `start-waiting-${newRoomId}` },
      );

      logger.info(
        `[reconciliationWorker] Successfully provisioned room ${newRoomId}. Scheduled start_waiting_room in ${delayToStart}ms (${preStartSeconds}s before startTime).`,
      );

      return;
    }

    // Open bracket visibility using the configured pre-start buffer
    if (job.name === "activate_bracket") {
      const contest = await ContestMatch.findById(contestId);

      if (!contest || contest.status === "completed") return;

      if (contest.status !== "active") {
        contest.status = "active";
        await contest.save();
        await redis.hSet(`contest:${contestId}:meta`, { status: "active" });

        const waitingRooms = await ContestRoom.find({
          contestId,
          status: "waiting",
        });
        const { synchronizeBracketRuntime } =
          await import("@/lib/contests/bracket");

        await synchronizeBracketRuntime(contestId);

        logger.info(
          `[reconciliationWorker] activate_bracket: contest ${contestId} is now active with ${waitingRooms.length} waiting rooms scheduled for ready timeout.`,
        );
      }

      return;
    }

    // Visibility may open early but the persisted ready window starts on schedule
    if (job.name === "start_waiting_room") {
      await ContestRoom.updateOne(
        { _id: roomId, status: "pending" },
        { $set: { status: "waiting", runtimeSyncPending: true } },
      );
      await ContestMatch.updateOne(
        { _id: contestId, status: { $ne: "completed" } },
        { $set: { status: "active" } },
      );
      await synchronizeRoomRuntime(roomId);

      return;
    }

    // Finalize natural completion using the problem set created during provisioning
    if (job.name === "room_completed") {
      logger.info(
        `[reconciliationWorker] Handling room_completed for room ${roomId}`,
      );

      // Fetch teams from Redis before cleanup
      const completedTeams = await redis.sMembers(`room:${roomId}:teams`);

      if (completedTeams.length === 0) {
        logger.info(
          `[reconciliationWorker] room_completed: no teams found in Redis for room ${roomId}. Already processed?`,
        );

        return;
      }

      // Write final scores to MongoDB
      const completedRoom = await ContestRoom.findById(roomId);

      if (completedRoom) {
        let maxScore = -1;
        let bestTeamId: string | null = null;
        let isTie = false;

        for (const tId of completedTeams) {
          const score = await redis.zScore(`room:${roomId}:scores`, tId);
          const finalScore = Math.max(score || 0, 0);

          if (finalScore > maxScore) {
            maxScore = finalScore;
            bestTeamId = tId;
            isTie = false;
          } else if (finalScore === maxScore) {
            isTie = true;
          }

          await ContestTeam.findByIdAndUpdate(tId, { score: finalScore });
        }

        if (bestTeamId && !isTie && mongoose.isValidObjectId(bestTeamId)) {
          completedRoom.winnerTeamId = new mongoose.Types.ObjectId(bestTeamId);
          await completedRoom.save();
        }
      }

      // Write ContestSubmission records from Redis stream
      const completedSubs = await redis.xRange(
        `room:${roomId}:submissions`,
        "-",
        "+",
      );

      for (const sub of completedSubs) {
        const data = JSON.parse(sub.message.data);

        await ContestSubmission.updateOne(
          { roomId, submissionId: String(data.cfSubmissionId) },
          {
            $setOnInsert: {
              contestId,
              submissionId: String(data.cfSubmissionId),
              userId: data.userId,
              teamId: data.teamId,
              problemId: data.problemId,
              platform: "codeforces",
              verdict: data.verdict,
              points: data.points,
              solveMs: data.solveMs,
              submittedAt: new Date(data.cfTimestamp || Date.now()),
            },
          },
          { upsert: true },
        );
      }

      // Finally, update the room status to "ended"
      if (completedRoom) {
        await finishRoomParticipation(roomId);
        completedRoom.status = "ended";

        // For bracket contests: advance winner + check round completion
        if (contestId) {
          const completedContest =
            await ContestMatch.findById(contestId).lean();

          if (completedContest?.format === "bracket") {
            const stateObj = await redis.hGetAll(`room:${roomId}:state`);
            const { winnerId: bracketWinnerId, teamScores } =
              await determineWinner(redis, roomId, completedTeams, stateObj);

            // Scenario S3: If both teams scored 0 points (no solves), both are eliminated and null advances!
            const allZero =
              completedTeams.length >= 2 &&
              Object.values(teamScores).every((s) => s === 0);

            if (allZero) {
              logger.info(
                `[reconciliationWorker] room_completed: No problems solved by either team in room ${roomId}. Both eliminated, advancing null player.`,
              );
              completedRoom.terminationReason = "no_solve";
              await completedRoom.save();

              for (const tId of completedTeams) {
                await ContestTeam.findByIdAndUpdate(tId, {
                  isNull: true,
                  name: "[Eliminated]",
                });
              }

              try {
                const { advanceNullPlayer, checkRoundCompletion } =
                  await import("@/lib/contests/bracket");

                await advanceNullPlayer(contestId, roomId);

                if (completedRoom.currentRoundId) {
                  const roundDoc = await ContestRound.findById(
                    completedRoom.currentRoundId,
                  ).lean();

                  if (roundDoc)
                    await checkRoundCompletion(contestId, roundDoc.roundNumber);
                }
              } catch (bracketErr) {
                logger.error(
                  `[reconciliationWorker] room_completed: null advancement failed for room ${roomId}:`,
                  bracketErr,
                );
              }
            } else {
              try {
                const { advanceWinner, checkRoundCompletion } =
                  await import("@/lib/contests/bracket");

                await advanceWinner(roomId, contestId, bracketWinnerId);

                if (completedRoom.currentRoundId) {
                  const roundDoc = await ContestRound.findById(
                    completedRoom.currentRoundId,
                  ).lean();

                  if (roundDoc)
                    await checkRoundCompletion(contestId, roundDoc.roundNumber);
                }
              } catch (bracketErr) {
                logger.error(
                  `[reconciliationWorker] room_completed: bracket advancement failed for room ${roomId}:`,
                  bracketErr,
                );
              }
            }

            // Preserve contest runtime keys until the entire bracket finishes
            const completedRoomKeys = await redis.keys(`room:${roomId}:*`);

            if (completedRoomKeys.length > 0)
              await redis.del(completedRoomKeys);

            for (const tId of completedTeams) {
              await redis.del(`team:${tId}:meta`);
              await redis.del(`team:${tId}:users`);
            }

            logger.info(
              `[reconciliationWorker] room_completed (bracket): cleanup done for room ${roomId}.`,
            );

            return;
          }
        }

        // Non-bracket: mark contest completed if all rooms ended
        if (contestId) {
          const totalRooms = await ContestRoom.countDocuments({ contestId });
          const endedRooms = await ContestRoom.countDocuments({
            contestId,
            status: "ended",
          });

          if (totalRooms > 0 && totalRooms === endedRooms) {
            await ContestMatch.findByIdAndUpdate(contestId, {
              status: "completed",
              endTime: new Date(),
            });
            logger.info(
              `[reconciliationWorker] room_completed: all rooms ended. Marked contest ${contestId} as completed.`,
            );
          }
        }
      }

      // Non-bracket: clean up room-scoped, team-scoped, and contest-scoped keys
      const completedRoomKeys = await redis.keys(`room:${roomId}:*`);

      if (completedRoomKeys.length > 0) {
        await redis.del(completedRoomKeys);
      }

      for (const tId of completedTeams) {
        await redis.del(`team:${tId}:meta`);
        await redis.del(`team:${tId}:users`);
      }

      if (contestId) {
        const totalRooms = await ContestRoom.countDocuments({ contestId });
        const endedRooms = await ContestRoom.countDocuments({
          contestId,
          status: "ended",
        });

        if (totalRooms > 0 && totalRooms === endedRooms) {
          await redis.del(`contest:${contestId}:rooms`);
        }
      }

      logger.info(
        `[reconciliationWorker] room_completed: finished cleanup for room ${roomId}.`,
      );

      return;
    }

    if (job.name !== "room_timeout") {
      throw new Error("Unsupported contest reconciliation job");
    }

    const teams = await redis.sMembers(`room:${roomId}:teams`);

    if (teams.length === 0) {
      logger.info(
        `[reconciliationWorker] No teams found in Redis for room ${roomId}. Room likely already processed. Skipping.`,
      );

      return;
    }

    const stateObj = await redis.hGetAll(`room:${roomId}:state`);
    const { winnerId, teamScores } = await determineWinner(
      redis,
      roomId,
      teams,
      stateObj,
    );

    // 2. Write to MongoDB
    const room = await ContestRoom.findById(roomId);

    if (room) {
      if (trigger === "timeout") room.terminationReason = "timeout";

      if (winnerId && mongoose.isValidObjectId(winnerId)) {
        room.winnerTeamId = new mongoose.Types.ObjectId(winnerId);
      }

      await room.save();

      for (const tId of teams) {
        const finalScore = Math.max(teamScores[tId] || 0, 0);

        await ContestTeam.findByIdAndUpdate(tId, { score: finalScore });
      }
    }

    // Advance bracket outcomes for timeout endings
    if (contestId) {
      try {
        const bracketContest = await ContestMatch.findById(contestId).lean();

        if (bracketContest?.format === "bracket") {
          const allZero =
            teams.length >= 2 &&
            teams.every((tId) => (teamScores[tId] || 0) === 0);

          if (allZero && trigger === "timeout") {
            await ContestRoom.updateOne(
              { _id: roomId, advancementCompletedAt: { $exists: false } },
              { $unset: { winnerTeamId: "" } },
            );

            const { advanceNullPlayer, checkRoundCompletion } =
              await import("@/lib/contests/bracket");

            await advanceNullPlayer(contestId, roomId);

            const bracketRoom = await ContestRoom.findById(roomId).lean();

            if (bracketRoom?.currentRoundId) {
              const roundDoc = await ContestRound.findById(
                bracketRoom.currentRoundId,
              ).lean();

              if (roundDoc)
                await checkRoundCompletion(contestId, roundDoc.roundNumber);
            }
          } else if (winnerId) {
            const { advanceWinner, checkRoundCompletion } =
              await import("@/lib/contests/bracket");

            await advanceWinner(roomId, contestId, winnerId);

            const bracketRoom = await ContestRoom.findById(roomId).lean();

            if (bracketRoom?.currentRoundId) {
              const roundDoc = await ContestRound.findById(
                bracketRoom.currentRoundId,
              ).lean();

              if (roundDoc)
                await checkRoundCompletion(contestId, roundDoc.roundNumber);
            }
          }
        }
      } catch (err) {
        logger.error(
          `[reconciliationWorker] Bracket advancement error for room ${roomId}:`,
          err,
        );
      }
    }

    // 3. Write ContestSubmission records
    const submissions = await redis.xRange(
      `room:${roomId}:submissions`,
      "-",
      "+",
    );

    for (const sub of submissions) {
      const data = contestSubmissionEventSchema.parse(
        JSON.parse(sub.message.data),
      );

      await ContestSubmission.updateOne(
        { roomId, submissionId: String(data.cfSubmissionId) },
        {
          $setOnInsert: {
            contestId,
            submissionId: String(data.cfSubmissionId),
            userId: data.userId,
            teamId: data.teamId,
            problemId: data.problemId,
            platform: "codeforces",
            verdict: data.verdict,
            points: data.points,
            solveMs: data.solveMs,
            submittedAt: new Date(data.cfTimestamp || Date.now()),
          },
        },
        { upsert: true },
      );
    }

    // 4. Finalise ContestProblemSet
    const problemsRaw = await redis.lRange(`room:${roomId}:problems`, 0, -1);

    if (problemsRaw.length > 0) {
      const problems = parseContestRoomProblems(problemsRaw);
      const problemSet = new ContestProblemSet({
        contestId,
        roomId,
        problems: problems.map((problem) => ({
          platform: "codeforces",
          problemId: problem.problemId,
          name:
            typeof problem.name === "string" ? problem.name : problem.problemId,
          rating: typeof problem.rating === "number" ? problem.rating : 0,
          points: problem.points || 100,
        })),
      });

      await problemSet.save();
    }

    // 5. Finalise Room Status
    if (room) {
      await finishRoomParticipation(roomId);

      // Approach 1: Global Backend Aggregation for ContestMatch
      if (contestId) {
        const totalRooms = await ContestRoom.countDocuments({ contestId });
        const endedRooms = await ContestRoom.countDocuments({
          contestId,
          status: "ended",
        });

        if (totalRooms > 0 && totalRooms === endedRooms) {
          await ContestMatch.findByIdAndUpdate(contestId, {
            status: "completed",
            endTime: new Date(), // Force end time to now since match finished dynamically
          });
          logger.info(
            `[reconciliationWorker] All rooms ended. Marked contest ${contestId} as completed.`,
          );
        }
      }
    }

    // Publish endings triggered by timeout
    if (trigger === "timeout") {
      const stateObj = await redis.hGetAll(`room:${roomId}:state`);
      const startTime = parseInt(stateObj.startTime || "0", 10);

      await publishRoom(roomId, {
        type: "room.end",
        finalScores: teamScores,
        duration: Date.now() - startTime,
        reason: "timeout",
      });
      await redis.hSet(`room:${roomId}:state`, { status: "completed" });

      // Notify clients that the bracket advanced so they draw green lines and update node states
      if (contestId) {
        const { publishContest } = await import("@/lib/contests/events");

        await publishContest(contestId, {
          type: "contest.bracket_update",
          contestId: contestId,
        });
      }
    }

    // 5. Clean up Redis
    const keys = await redis.keys(`room:${roomId}:*`);

    if (keys.length > 0) {
      await redis.del(keys);
    }

    logger.info(
      `[reconciliationWorker] Finished job ${job.id} for room ${roomId}`,
    );
  },
  {
    connection: bullMqConnection,
    concurrency: 1,
    lockDuration: workerEnv.CONTEST_WORKER_LOCK_MINUTES * 60_000,
  },
);

reconciliationWorker.on("completed", (job) => {
  logger.info(`[reconciliationWorker] Job ${job.id} completed successfully`);
});

reconciliationWorker.on("failed", (job, err) => {
  logger.error(
    `[reconciliationWorker] Job ${job?.id} failed with error: ${err.message}`,
    err,
  );
});
