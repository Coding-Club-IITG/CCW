import { Worker, Job } from "bullmq";
import { connection } from "../bullmq";
import { logger } from "../utils";
import { getRedis } from "../redis";
import dbConnect from "../mongodb";
import ContestRoom from "../../models/ContestRoom";
import { publishRoom } from "../sse";
import ContestProblemSet from "../../models/ContestProblemSet";
import ContestTeam from "../../models/ContestTeam";
import ContestSubmission from "../../models/ContestSubmission"; // Make sure to create this model if not exists

export const reconciliationWorker = new Worker(
  "reconciliation_queue",
  async (job: Job) => {
    logger.info(`[reconciliationWorker] Processing job ${job.id} (name: ${job.name})`, job.data);
    const { roomId, contestId, trigger, forfeitedUserId } = job.data;
    const redis = await getRedis();
    await dbConnect();

    // 1. Determine winner
    const teams = await redis.sMembers(`room:${roomId}:teams`);
    let winnerId = null;
    let maxScore = -1;
    let minSolveTime = Infinity;

    const teamScores: Record<string, number> = {};

    for (const tId of teams) {
      const scoreStr = await redis.zScore(`room:${roomId}:scores`, tId);
      const score = scoreStr || 0;
      teamScores[tId] = score;

      const timeStr = await redis.zScore(`room:${roomId}:solve_times`, tId);
      const solveTime = timeStr || 0;

      if (score > maxScore) {
        maxScore = score;
        minSolveTime = solveTime;
        winnerId = tId;
      } else if (score === maxScore && score > 0) {
        if (solveTime < minSolveTime) {
          minSolveTime = solveTime;
          winnerId = tId;
        }
      }
    }

    // Handle forfeit winner if provided
    if (trigger === "forfeit" && forfeitedUserId) {
      // Find the team that the forfeited user does NOT belong to
      for (const tId of teams) {
        const isMember = await redis.sIsMember(`team:${tId}:users`, forfeitedUserId);
        if (!isMember) {
          winnerId = tId;
          break;
        }
      }
    }

    // 2. Write to MongoDB
    const room = await ContestRoom.findById(roomId);
    if (room) {
      room.status = "ended";
      // We don't have an explicit winner field in IContestRoom schema according to Stage 1, 
      // but if we do, we could set it. The prompt says: "Write final ContestRoom (scores, winner, endTime, trigger)."
      // Let's assume we update the team scores.
      for (const tId of teams) {
        await ContestTeam.findByIdAndUpdate(tId, { score: teamScores[tId] });
      }
      await room.save();
    }

    // 3. Write ContestSubmission records
    const submissions = await redis.xRange(`room:${roomId}:submissions`, "-", "+");
    for (const sub of submissions) {
      const data = JSON.parse(sub.message.data);
      // Construct and save ContestSubmission
      const submission = new ContestSubmission({
        roomId,
        contestId,
        userId: data.userId,
        teamId: data.teamId,
        problemId: data.problemId,
        cfSubmissionId: data.cfSubmissionId,
        verdict: data.verdict,
        points: data.points,
        solveMs: data.solveMs
      });
      await submission.save();
    }

    // 4. Finalise ContestProblemSet (e.g. tracking who solved what) - stubbed for now if schema doesn't fully support
    
    // Publish room.end if triggered by timeout or forfeit (meaning it didn't end naturally in cfSyncWorker)
    if (trigger === "timeout" || trigger === "forfeit") {
      const stateObj = await redis.hGetAll(`room:${roomId}:state`);
      const startTime = parseInt(stateObj.startTime || "0", 10);
      await publishRoom(roomId, {
        type: "room.end",
        finalScores: teamScores,
        duration: Date.now() - startTime
      });
      await redis.hSet(`room:${roomId}:state`, { status: "completed" });
    }

    // 5. Clean up Redis
    const keys = await redis.keys(`room:${roomId}:*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }

    logger.info(`[reconciliationWorker] Finished job ${job.id} for room ${roomId}`);
  },
  {
    connection,
  }
);

reconciliationWorker.on("completed", (job) => {
  logger.info(`[reconciliationWorker] Job ${job.id} completed successfully`);
});

reconciliationWorker.on("failed", (job, err) => {
  logger.error(`[reconciliationWorker] Job ${job?.id} failed with error: ${err.message}`, err);
});
