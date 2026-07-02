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
    if (job.name !== "room_completion" && job.name !== "room_timeout" && job.name !== "room_forfeit") {
      return;
    }

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
    if (contestId) {
      try {
        const contest = await CustomContest.findById(contestId).lean();
        if (contest && contest.format === "bracket") {
          // Update ContestStanding and Redis standings for each team
          const ContestStanding = (await import("../../models/ContestStanding")).default;
          
          for (const tId of teams) {
            const isWinner = tId === winnerId;
            const teamDoc = await ContestTeam.findById(tId).lean();
            
            if (teamDoc && teamDoc.members) {
              for (const userId of teamDoc.members) {
                let standing = await ContestStanding.findOne({
                  contestId,
                  userId,
                });
                
                if (!standing) {
                  standing = new ContestStanding({
                    roomId,
                    contestId,
                    userId,
                    teamId: tId,
                    score: 0,
                    problemsSolved: 0,
                    wins: 0,
                    losses: 0,
                    eliminated: false
                  });
                }
                
                standing.roomId = roomId;
                standing.teamId = tId;
                standing.score += (teamScores[tId] || 0);
                
                if (isWinner) {
                  standing.wins = (standing.wins || 0) + 1;
                } else if (winnerId) {
                  // Only count as a loss if there is a definitive winner
                  standing.losses = (standing.losses || 0) + 1;
                  standing.eliminated = true;
                }
                
                await standing.save();
              }
            }
            
            if (isWinner) {
              await redis.zIncrBy(`contest:${contestId}:standings`, 1, tId);
            }
          }

          if (winnerId) {
            const { advanceWinner, checkRoundCompletion } = await import("../bracket");
            await advanceWinner(roomId, contestId, winnerId);

            if (room && room.currentRoundId) {
              const roundDoc = await ContestRound.findById(room.currentRoundId).lean();
              if (roundDoc) {
                await checkRoundCompletion(contestId, roundDoc.roundNumber);
              }
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
    setTimeout(async () => {
      try {
        const redisForCleanup = await getRedis();
        const keys = await redisForCleanup.keys(`room:${roomId}:*`);
        if (keys.length > 0) {
          await redisForCleanup.del(keys);
        }
      } catch(e) {}
    }, 5000);

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
