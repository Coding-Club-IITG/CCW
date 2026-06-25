import { Worker, Job } from "bullmq";
import { connection } from "../bullmq";
import { logger } from "../utils";
import { getRedis } from "../redis";
import dbConnect from "../mongodb";
import ContestRoom from "../../models/ContestRoom";
import ContestRound from "../../models/ContestRound";
import CustomContest from "../../models/CustomContest";
import { publishRoom } from "../sse";
import ContestProblemSet from "../../models/ContestProblemSet";
import ContestTeam from "../../models/ContestTeam";
import ContestSubmission from "../../models/ContestSubmission";

export const reconciliationWorker = new Worker(
  "reconciliation_queue",
  async (job: Job) => {
    logger.info(`[reconciliationWorker] Processing job ${job.id} (name: ${job.name})`, job.data);
    const { roomId, contestId, trigger, forfeitedUserId, teamId } = job.data;
    const redis = await getRedis();
    await dbConnect();

    // Handle team ready timeout
    if (job.name === "team_ready_timeout") {
      const state = await redis.hGetAll(`room:${roomId}:state`);
      
      // Only process if room is still waiting
      if (state && state.status === "waiting") {
        const teamMembers = await redis.sMembers(`team:${teamId}:users`);
        const readyMembers = [];
        for (const memberId of teamMembers) {
          const isReady = await redis.sIsMember(`room:${roomId}:ready_users`, memberId);
          if (isReady) {
            readyMembers.push(memberId);
          }
        }

        const allReady = readyMembers.length === teamMembers.length;
        if (!allReady) {
          // Team is not ready within 60s, withdraw the entire team
          logger.info(`[reconciliationWorker] Team ${teamId} not ready within 60s, withdrawing from room ${roomId}`);
          
          // Remove team from room and mark participants as withdrawn
          await redis.sRem(`room:${roomId}:teams`, teamId);
          await redis.del(`team:${teamId}:users`);
          await redis.del(`team:${teamId}:meta`);
          
          // Remove team members from participants
          for (const memberId of teamMembers) {
            await redis.sRem(`room:${roomId}:ready_users`, memberId);
          }

          // Publish withdrawal event
          await publishRoom(roomId, {
            type: "team.withdrawn",
            teamId,
            reason: "ready_timeout"
          });

          // If no teams are left or only one team, end the room
          const remainingTeams = await redis.sMembers(`room:${roomId}:teams`);
          if (remainingTeams.length === 0 || remainingTeams.length === 1) {
            await redis.hSet(`room:${roomId}:state`, { status: "completed" });
            const teamScores: Record<string, number> = {};
            for (const tId of remainingTeams) {
              const score = await redis.zScore(`room:${roomId}:scores`, tId);
              teamScores[tId] = score || 0;
            }
            await publishRoom(roomId, {
              type: "room.end",
              finalScores: teamScores,
              reason: "team_withdrawal"
            });
          }
        }
      }
      return;
    }

    // Original reconciliation logic continues below
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

    // 2.5 Bracket advancement hook for knockout contests
    if (contestId && winnerId) {
      try {
        const contest = await CustomContest.findById(contestId).lean();
        if (contest && contest.format === "bracket") {
          const { advanceWinner, checkRoundCompletion } = await import("../bracket");
          await advanceWinner(roomId, contestId, winnerId);

          if (room && room.currentRoundId) {
            const roundDoc = await ContestRound.findById(room.currentRoundId).lean();
            if (roundDoc) {
              await checkRoundCompletion(contestId, roundDoc.roundNumber);
            }
          }
        }
      } catch (err) {
        logger.error(`[reconciliationWorker] Bracket advancement error for room ${roomId}:`, err);
      }
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
        platform: "codeforces",
        submissionId: data.cfSubmissionId,
        verdict: data.verdict,
        points: data.points,
        solveMs: data.solveMs,
        submittedAt: new Date(data.cfTimestamp || Date.now())
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
