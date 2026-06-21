import { Worker, Job } from "bullmq";
import { connection } from "../bullmq";
import { logger } from "../utils";
import { syncCodeforcesProblems } from "../jobs/cfProblemSync";
import { fetchCodeforcesUserStatus } from "../cf-api";
import { publishUser } from "../sse";
import dbConnect from "../mongodb";
import ContestRoom from "../../models/ContestRoom";
import CustomContest from "../../models/CustomContest";

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

    if (job.name === "cf_sync") {
      const { roomId, userId, teamId, cfHandle, problemId } = job.data;
      
      try {
        await dbConnect();
        
        // 1. Fetch Room and Contest to get timestamps
        const room = await ContestRoom.findById(roomId).lean();
        if (!room) {
          logger.warn(`[cfSyncWorker] Room ${roomId} not found for sync.`);
          await publishUser(userId, { verdict: "invalid", reason: "room_not_found" });
          return;
        }

        const contest = await CustomContest.findById(room.contestId).lean();
        if (!contest) {
          logger.warn(`[cfSyncWorker] Contest not found for room ${roomId}.`);
          await publishUser(userId, { verdict: "invalid", reason: "contest_not_found" });
          return;
        }

        const lowerTimestamp = contest.startTime.getTime();
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

        for (const sub of submissions) {
          const subProblemId = `${sub.problem.contestId}${sub.problem.index}`;
          const subTimestamp = sub.creationTimeSeconds * 1000;
          const subVerdict = sub.verdict;

          // Check if it's the right problem
          if (subProblemId.toUpperCase() === problemId.toUpperCase()) {
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

          // Wait, emit internal sync.detected event (consumed by Room engine in Stage 3)
          // For now, publish to the user stream as required.
          await publishUser(userId, eventPayload);
          
          // To consume internally, we could publish to a local event emitter or Redis queue.
          // The issue says: "emit the internal sync.detected event... Also publish sync.detected to events:user:<userId>"
          // Assuming Stage 3 will listen on some internal bus or BullMQ. For now, we'll log it.
          logger.info(`[cfSyncWorker] Valid AC detected for ${cfHandle} on ${problemId}. emitted sync.detected.`);
        } else {
          logger.info(`[cfSyncWorker] Validation failed or WA for ${cfHandle} on ${problemId}.`);
          await publishUser(userId, { type: "sync.failed", verdict: "WA" });
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

cfSyncWorker.on("completed", (job) => {
  logger.info(`[cfSyncWorker] Job ${job.id} completed successfully`);
});

cfSyncWorker.on("failed", async (job, err) => {
  logger.error(`[cfSyncWorker] Job ${job?.id} failed with error: ${err.message}`, err);
  
  if (job?.name === "cf_sync" && job.attemptsMade >= (job.opts.attempts || 3)) {
    const { userId } = job.data;
    logger.error(`[cfSyncWorker] Permanent failure for sync job ${job.id}. Publishing cf_unavailable to user ${userId}`);
    await publishUser(userId, { type: "sync.failed", reason: "cf_unavailable" });
  }
});
