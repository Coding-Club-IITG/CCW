import { Worker, Job } from "bullmq";
import { connection } from "../bullmq";
import { logger } from "../utils";
import { syncCodeforcesProblems } from "../jobs/cfProblemSync";
import { fetchCodeforcesUserStatus } from "../cf-api";
import { publishUser, publishRoom } from "../sse";
import { getRedis, claimProblem } from "../redis";
import { reconciliationQueue } from "../bullmq";
import dbConnect from "../mongodb";
import ContestRoom from "../../models/ContestRoom";
import CustomContest from "../../models/CustomContest";
import mongoose from "mongoose";

// Optional: cache a pause timer to avoid repeated pausing when circuit breaker trips
let isCircuitBreakerOpen = false;

export const cfSyncWorker = new Worker(
  "cf_sync_queue",
  async (job: Job) => {
    logger.info(`[cfSyncWorker] Processing job ${job.id} (name: ${job.name})`, job.data);
    
    if (job.name === "nightly-cf-problem-sync") {
      await syncCodeforcesProblems();
      return;
    }

    if (job.name === "solved_prefetch") {
      const { cfHandle } = job.data;
      const { prefetchUserSolvedHistory } = require("../cf-api");
      await prefetchUserSolvedHistory(cfHandle);
      return;
    }

    if (job.name === "cf_sync") {
      const { roomId, userId, teamId, cfHandle, problemId } = job.data;
      
      try {
        await dbConnect();
        
        if (!mongoose.Types.ObjectId.isValid(roomId)) {
          logger.warn(`[cfSyncWorker] Invalid roomId format: ${roomId}`);
          await publishUser(userId, { verdict: "invalid", reason: "invalid_room_id" });
          return;
        }

        // 1. Fetch Room and Contest to get timestamps
        const room = await ContestRoom.findById(roomId).lean();
        if (!room) {
          logger.warn(`[cfSyncWorker] Room ${roomId} not found for sync.`);
          await publishUser(userId, { verdict: "invalid", reason: "room_not_found" });
          return;
        }

        if (!room.contestId || !mongoose.Types.ObjectId.isValid(room.contestId)) {
          logger.warn(`[cfSyncWorker] Invalid or missing contestId in room ${roomId}.`);
          await publishUser(userId, { verdict: "invalid", reason: "invalid_contest_id" });
          return;
        }

        const contest = await CustomContest.findById(room.contestId).lean();
        if (!contest) {
          logger.warn(`[cfSyncWorker] Contest not found for room ${roomId}.`);
          await publishUser(userId, { verdict: "invalid", reason: "contest_not_found" });
          return;
        }

        // Verify userId is part of the team
        const redis = await getRedis();
        const isTeamMember = await redis.sIsMember(`team:${teamId}:users`, userId);
        if (!isTeamMember) {
          logger.warn(`[cfSyncWorker] User ${userId} is not a member of team ${teamId} in room ${roomId}.`);
          await publishUser(userId, { verdict: "invalid", reason: "not_team_member" });
          return;
        }

        const state = await redis.hGetAll(`room:${roomId}:state`);
        const roomStartTimeMs = state?.startTime ? parseInt(state.startTime, 10) : contest.startTime.getTime();

        const lowerTimestamp = roomStartTimeMs;
        // Add a small grace period (e.g., 5 minutes) or just use endTime
        const upperTimestamp = contest.endTime.getTime() + 5 * 60 * 1000;

        // 2. Fetch CF Submissions (last 20)
        let submissions = [];
        try {
          submissions = await fetchCodeforcesUserStatus(cfHandle, 20);
        } catch (error: any) {
          if (error.response?.status === 429) {
            logger.warn(`[cfSyncWorker] CF API rate limited (429). Pausing queue for 30s.`);
            if (!isCircuitBreakerOpen) {
              isCircuitBreakerOpen = true;
              // Pause the worker for 30s, this is a BullMQ feature
              cfSyncWorker.pause();
              setTimeout(() => {
                cfSyncWorker.resume();
                isCircuitBreakerOpen = false;
              }, 30000);
            }
            throw error; // Let BullMQ retry
          }
          throw error;
        }

        // 3. Validation Matrix
        let isValid = false;
        let matchedSubmission = null;
        let hasSubmissionForProblem = false;
        let bestVerdict = "not_found";

        for (const sub of submissions) {
          const subProblemId = `${sub.problem.contestId || ""}${sub.problem.index}`;
          const subTimestamp = sub.creationTimeSeconds * 1000;
          const subVerdict = sub.verdict || "UNKNOWN";

          // Check if it's the right problem
          if (subProblemId.toUpperCase() === problemId.toUpperCase()) {
            hasSubmissionForProblem = true;
            if (subVerdict !== "OK") {
              bestVerdict = subVerdict;
            }

            // Check handle match
            const authorHandle = sub.author.members.some(
              (m: any) => m.handle.toLowerCase() === cfHandle.toLowerCase()
            );

            if (
              authorHandle &&
              subVerdict === "OK" &&
              subTimestamp >= lowerTimestamp &&
              subTimestamp <= upperTimestamp
            ) {
              isValid = true;
              matchedSubmission = sub;
              break;
            }
          }
        }

        // 4. Result Handling
        if (isValid && matchedSubmission) {
          const eventPayload = {
            type: "sync.detected",
            roomId,
            userId,
            teamId,
            problemId,
            cfSubmissionId: matchedSubmission.id,
            cfTimestamp: matchedSubmission.creationTimeSeconds * 1000,
            verdict: "OK",
            pointsAwarded: null, // Stage 3 fills this
          };

          const redis = await getRedis();
          let isAdvanceTriggered = false;

          if (state && state.status === "active") {
            const problemsRaw = await redis.lRange(`room:${roomId}:problems`, 0, -1);
            const problems = problemsRaw.map(p => JSON.parse(p));

            if (state.type === "arena") {
              const targetProblem = problems.find((p: any) => p.problemId === problemId);
              if (targetProblem) {
                const points = targetProblem.points || 100;
                const cfTimestamp = matchedSubmission.creationTimeSeconds * 1000;
                const startTime = parseInt(state.startTime || "0", 10);

                const claimResult = await claimProblem(
                  redis,
                  `room:${roomId}:locks`,
                  problemId,
                  teamId,
                  cfTimestamp
                );

                if (claimResult === "claimed" || claimResult.startsWith("reclaimed|")) {
                  if (claimResult.startsWith("reclaimed|")) {
                    const oldTeamId = claimResult.split("|")[1];
                    await redis.zIncrBy(`room:${roomId}:scores`, -points, oldTeamId);
                  }
                  
                  await redis.zIncrBy(`room:${roomId}:scores`, points, teamId);
                  const solveMs = cfTimestamp - startTime;
                  await redis.zAdd(`room:${roomId}:solve_times`, { score: solveMs, value: teamId });
                  
                  const submissionObj = {
                    userId,
                    teamId,
                    problemId,
                    cfSubmissionId: matchedSubmission.id,
                    verdict: "OK",
                    points,
                    solveMs,
                    cfTimestamp
                  };
                  await redis.xAdd(`room:${roomId}:submissions`, "*", { data: JSON.stringify(submissionObj) });

                  eventPayload.pointsAwarded = points;
                  
                  await publishRoom(roomId, {
                    type: "room.locked",
                    problemId,
                    claimedBy: teamId,
                    timestamp: cfTimestamp
                  });
                  
                  const scores: Record<string, number> = {};
                  const teams = await redis.sMembers(`room:${roomId}:teams`);
                  for (const tId of teams) {
                    const score = await redis.zScore(`room:${roomId}:scores`, tId);
                    scores[tId] = score || 0;
                  }
                  await publishRoom(roomId, { type: "room.score", scores });
                  
                  const lockCount = await redis.hLen(`room:${roomId}:locks`);
                  if (lockCount === problems.length) {
                    await redis.hSet(`room:${roomId}:state`, { status: "completed" });
                    await publishRoom(roomId, {
                      type: "room.end",
                      finalScores: scores,
                      duration: Date.now() - startTime
                    });

                    // Remove the timeout job since the room ended naturally
                    await reconciliationQueue.remove(`timeout-${roomId}`);

                    await reconciliationQueue.add(
                      "room_completed",
                      { roomId, contestId: state.contestId, trigger: "completed" },
                      { jobId: `completed-${roomId}` }
                    );
                  }
                }
              }
            } else {
              const currentProblemIndex = parseInt(state.currentProblem || "0", 10);
              const currentProblem = problems[currentProblemIndex];

              if (currentProblem && currentProblem.problemId === problemId) {
                const points = currentProblem.points || 100;
                const cfTimestamp = matchedSubmission.creationTimeSeconds * 1000;
                const startTime = parseInt(state.startTime || "0", 10);
                const solveMs = cfTimestamp - startTime;

                await redis.zIncrBy(`room:${roomId}:scores`, points, teamId);
                await redis.zAdd(`room:${roomId}:solve_times`, { score: solveMs, value: teamId });
                
                const submissionObj = {
                  userId,
                  teamId,
                  problemId,
                  cfSubmissionId: matchedSubmission.id,
                  verdict: "OK",
                  points,
                  solveMs,
                  cfTimestamp
                };
                await redis.xAdd(`room:${roomId}:submissions`, "*", { data: JSON.stringify(submissionObj) });

                eventPayload.pointsAwarded = points;
                isAdvanceTriggered = true;

                const newProblemIndex = currentProblemIndex + 1;
                await redis.hIncrBy(`room:${roomId}:state`, "currentProblem", 1);

                if (newProblemIndex === problems.length) {
                  await redis.hSet(`room:${roomId}:state`, { status: "completed" });
                  
                  const finalScores: Record<string, number> = {};
                  const teams = await redis.sMembers(`room:${roomId}:teams`);
                  for (const tId of teams) {
                    const score = await redis.zScore(`room:${roomId}:scores`, tId);
                    finalScores[tId] = score || 0;
                  }
                  
                  await publishRoom(roomId, {
                    type: "room.end",
                    finalScores,
                    duration: Date.now() - startTime
                  });

                  // Remove the timeout job since the room ended naturally
                  await reconciliationQueue.remove(`timeout-${roomId}`);

                  await reconciliationQueue.add(
                    "room_completed",
                    { roomId, contestId: state.contestId, trigger: "completed" },
                    { jobId: `completed-${roomId}` }
                  );
                } else {
                  const nextProblem = problems[newProblemIndex];
                  nextProblem.revealedAt = Date.now();
                  await redis.lSet(`room:${roomId}:problems`, newProblemIndex, JSON.stringify(nextProblem));

                  await publishRoom(roomId, {
                    type: "room.advance",
                    solvedBy: { userId, teamId },
                    problemIndex: newProblemIndex,
                    nextProblem
                  });

                  const scores: Record<string, number> = {};
                  const teams = await redis.sMembers(`room:${roomId}:teams`);
                  for (const tId of teams) {
                    const score = await redis.zScore(`room:${roomId}:scores`, tId);
                    scores[tId] = score || 0;
                  }
                  await publishRoom(roomId, { type: "room.score", scores });
                }
              }
            }
          }

          await publishUser(userId, eventPayload);
          
          logger.info(`[cfSyncWorker] Valid AC detected for ${cfHandle} on ${problemId}. emitted sync.detected.`);

        } else {
          const failVerdict = hasSubmissionForProblem ? bestVerdict : "not_found";
          logger.info(`[cfSyncWorker] Validation failed for ${cfHandle} on ${problemId}. Verdict: ${failVerdict}`);
          await publishUser(userId, { type: "sync.failed", verdict: failVerdict });
        }
      } catch (error: any) {
        logger.error(`[cfSyncWorker] Error processing cf_sync for user ${userId}:`, error.message);
        throw error; // Rethrow to trigger BullMQ retries
      }
    }
  },
  {
    connection,
    limiter: {
      max: 2,
      duration: 1000,
    },
  }
);

cfSyncWorker.on("completed", (job: Job) => {
  logger.info(`[cfSyncWorker] Job ${job.id} completed successfully`);
});

cfSyncWorker.on("failed", async (job: Job | undefined, err: Error) => {
  logger.error(`[cfSyncWorker] Job ${job?.id} failed with error: ${err.message}`, err);
  
  if (job?.name === "cf_sync" && job.attemptsMade >= (job.opts.attempts || 3)) {
    const { userId } = job.data;
    logger.error(`[cfSyncWorker] Permanent failure for sync job ${job.id}. Publishing cf_unavailable to user ${userId}`);
    await publishUser(userId, { type: "sync.failed", reason: "cf_unavailable" });
  }
});
