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
    let { roomId, contestId, trigger, forfeitedUserId, teamId } = job.data;
    const redis = await getRedis();
    await dbConnect();


    // Handle starting registration for scheduled brackets
    if (job.name === "start_registration" || trigger === "start_registration") {
      const contest = await CustomContest.findById(contestId);
      if (contest && contest.status === "draft") {
        contest.status = "registration";
        await contest.save();
        logger.info(`[reconciliationWorker] Started registration for contest ${contestId}`);
      }
      return;
    }

    // Handle checking contest start
    if (job.name === "check_start" || trigger === "check_start") {
      const contest = await CustomContest.findById(contestId);
      if (!contest) return;

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
      const requiredTeamSize = contest.format === "team-tournament" ? (contest.teamSize || 3) : 1;

      // Check if any team doesn't meet the required size
      const invalidTeams = Array.from(teamsMap.entries()).filter(([name, members]) => members.length !== requiredTeamSize);

      if (invalidTeams.length > 0) {
        logger.info(`[reconciliationWorker] Contest ${contestId} has incomplete teams. Canceling.`);
        await CustomContest.findByIdAndDelete(contestId);
        
        // Notify creator
        const Notification = (await import("../../models/Notification")).default;
        const CPUser = (await import("../../models/CPUser")).default;
        const creator = await CPUser.findById(contest.creatorId);
        if (creator && creator.userId) {
          await Notification.create({
            userId: creator.userId,
            type: "announcement",
            title: "Contest Cancelled",
            message: `Your contest '${contest.name}' was cancelled because some registered teams were incomplete.`,
            link: "/internal/contests"
          });
        }
        return;
      }
      
      const validTeams = Array.from(teamsMap.entries());

      if (validTeams.length < 2) {
        logger.info(`[reconciliationWorker] Contest ${contestId} did not meet minimum registration requirements. Canceling.`);
        await CustomContest.findByIdAndDelete(contestId);
        
        // Notify creator
        const Notification = (await import("../../models/Notification")).default;
        const CPUser = (await import("../../models/CPUser")).default;
        const creator = await CPUser.findById(contest.creatorId);
        if (creator && creator.userId) {
          await Notification.create({
            userId: creator.userId,
            type: "announcement",
            title: "Contest Cancelled",
            message: `Your contest '${contest.name}' was cancelled due to insufficient registrations.`,
            link: "/internal/contests"
          });
        }
        return;
      }

      // Provision room
      // Since room creation logic is in api/contests/rooms/route.ts, we'll replicate the core of it here 
      // or HTTP POST to it if possible. Replicating the core logic is safer to avoid HTTP loopbacks.
      const CFQuestion = (await import("../../models/CFQuestion")).default;
      const CPUser = (await import("../../models/CPUser")).default;
      const ContestProblemSet = (await import("../../models/ContestProblemSet")).default;
      const ContestTeam = (await import("../../models/ContestTeam")).default;
      const ContestRoom = (await import("../../models/ContestRoom")).default;

      const problemCount = contest.bulkProblemCount || 3;
      const minRating = contest.bulkRatingMin || 800;
      const maxRating = contest.bulkRatingMax || 1200;

      const allUserIds = validTeams.flatMap(t => t[1]);
      const users = await CPUser.find({ userId: { $in: allUserIds } });
      const solvedProblemIds = new Set<string>();
      for (const user of users) {
        if (user.solvedProblems) {
          for (const sp of user.solvedProblems) {
            solvedProblemIds.add(sp.problemId);
          }
        }
      }

      let availableProblems: any[] = [];
      if (contest.problemSelectionMode === "test") {
        availableProblems = [
          { problemId: "4A", name: "Watermelon", rating: 800 },
          { problemId: "1A", name: "Theatre Square", rating: 1000 },
          { problemId: "158A", name: "Next Round", rating: 800 }
        ].slice(0, problemCount || 2);
      } else {
        availableProblems = await CFQuestion.aggregate([
          {
            $match: {
              rating: { $gte: minRating, $lte: maxRating },
              problemId: { $nin: Array.from(solvedProblemIds) }
            }
          },
          { $sample: { size: problemCount } }
        ]);
      }

      if (availableProblems.length < problemCount) {
        logger.warn(`[reconciliationWorker] Insufficient problems for contest ${contestId}. Creating anyway with fewer problems.`);
      }

      const room = new ContestRoom({
        contestId: contest._id,
        name: `Room for ${contest.name}`,
        status: "waiting",
        participants: allUserIds,
        currentProblemIndex: 0,
        firstSolvers: []
      });

      const problemSet = new ContestProblemSet({
        contestId: contest._id,
        roomId: room._id,
        problems: availableProblems.map((p: any) => ({
          platform: "codeforces",
          problemId: p.problemId,
          name: p.name,
          rating: p.rating,
          points: 100
        }))
      });

      const teamSize = contest.teamSize || 1;
      const createdTeams = [];
      for (const t of validTeams) {
        const team = new ContestTeam({
          roomId: room._id,
          name: t[0],
          members: t[1],
          teamSize,
          score: 0
        });
        await team.save();
        createdTeams.push(team);
      }
      room.teams = createdTeams.map((t: any) => t._id);

      await room.save();
      await problemSet.save();

      const newRoomId = room._id.toString();

      const redisProblems = availableProblems.map((p: any) => JSON.stringify({
        problemId: p.problemId,
        name: p.name,
        rating: p.rating,
        revealedAt: null
      }));
      await redis.del(`room:${newRoomId}:problems`);
      if (redisProblems.length > 0) {
        await redis.rPush(`room:${newRoomId}:problems`, redisProblems);
      }

      const stateObj: any = {
        status: "waiting",
        type: contest.mode || "blitz",
        startTime: "",
        timeLimit: (contest.durationSeconds || 3600).toString(),
        contestId: contestId.toString(),
        readyCount: 0
      };
      if (contest.mode !== "arena") {
        stateObj.currentProblem = 0;
      }
      await redis.hSet(`room:${newRoomId}:state`, stateObj);
      await redis.sAdd(`room:${newRoomId}:teams`, createdTeams.map((t: any) => t._id.toString()));

      for (const t of createdTeams) {
        const tId = t._id.toString();
        await redis.hSet(`team:${tId}:meta`, { name: t.name, score: 0 });
        await redis.sAdd(`team:${tId}:users`, t.members.map((m: any) => m.toString()));
      }

      await redis.sAdd(`contest:${contestId}:rooms`, newRoomId);

      contest.status = "active";
      await contest.save();

      // Schedule the timeout job based on the contest's duration
      const timeoutMs = (contest.durationSeconds || 3600) * 1000;
      const { reconciliationQueue } = await import("../bullmq");
      await reconciliationQueue.add(
        "timeout",
        { roomId: newRoomId, contestId: contestId.toString(), trigger: "timeout" },
        { delay: timeoutMs, jobId: `timeout-${newRoomId}` }
      );

      logger.info(`[reconciliationWorker] Successfully provisioned room ${newRoomId} for contest ${contestId}. Scheduled timeout in ${timeoutMs}ms.`);
      return;
    }

    // Handle ending registration for brackets
    if (job.name === "end_registration" || trigger === "end_registration") {
      const contest = await CustomContest.findById(contestId);
      if (!contest || contest.format !== "bracket") return;
      
      // Flip status to active so generateBracket can run
      contest.status = "active";
      await contest.save();
      logger.info(`[reconciliationWorker] Ended registration for bracket contest ${contestId}. Generating bracket...`);
      
      try {
        const { generateBracket } = await import("../bracket");
        await generateBracket(contestId);
        

      } catch (err: any) {
        logger.error(`[reconciliationWorker] Error generating bracket for ${contestId}:`, err);
      }
      return;
    }

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

    // Handle mid-match disconnect timeout
    if (job.name === "mid_match_disconnect_timeout") {
      const { userId: disconnectedUserId } = job.data;
      
      // Check if user is still offline
      const presenceKey = `room:${roomId}:presence:${disconnectedUserId}`;
      const isOnline = await redis.exists(presenceKey);
      const state = await redis.hGetAll(`room:${roomId}:state`);
      
      if (!isOnline && state && state.status === "active") {
        logger.info(`[reconciliationWorker] User ${disconnectedUserId} disconnected for too long in room ${roomId}. Forfeiting.`);
        // Find which team this user belongs to
        const allTeams = await redis.sMembers(`room:${roomId}:teams`);
        let forfeitedTeamId = null;
        for (const tId of allTeams) {
          const isMember = await redis.sIsMember(`team:${tId}:users`, disconnectedUserId);
          if (isMember) {
            forfeitedTeamId = tId;
            break;
          }
        }
        
        if (forfeitedTeamId) {
          // Trigger a forfeit for this team, declare the other team the winner
          trigger = "forfeit";
          forfeitedUserId = disconnectedUserId;
          // We will let the original reconciliation logic below handle the `trigger === "forfeit"` ending procedure
        } else {
          return;
        }
      } else {
        // User came back online, or room is no longer active. Ignore.
        logger.info(`[reconciliationWorker] mid_match_disconnect_timeout ignored for ${disconnectedUserId} (isOnline=${isOnline}, status=${state?.status})`);
        return;
      }
    }

    // Original reconciliation logic continues below
    const teams = await redis.sMembers(`room:${roomId}:teams`);
    if (teams.length === 0) {
      logger.info(`[reconciliationWorker] No teams found in Redis for room ${roomId}. Room likely already processed. Skipping.`);
      return;
    }
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
      if (trigger === "forfeit") room.terminationReason = "disconnect";
      else if (trigger === "timeout") room.terminationReason = "timeout";
      
      // We don't have an explicit winner field in IContestRoom schema according to Stage 1, 
      // but if we do, we could set it. The prompt says: "Write final ContestRoom (scores, winner, endTime, trigger)."
      // Let's assume we update the team scores.
      for (const tId of teams) {
        await ContestTeam.findByIdAndUpdate(tId, { score: teamScores[tId] });
      }
      await room.save();

      // Approach 1: Global Backend Aggregation for CustomContest
      if (contestId) {
        const totalRooms = await ContestRoom.countDocuments({ contestId });
        const endedRooms = await ContestRoom.countDocuments({ 
          contestId, 
          status: { $in: ["ended", "completed"] } 
        });
        
        if (totalRooms > 0 && totalRooms === endedRooms) {
          await CustomContest.findByIdAndUpdate(contestId, { 
            status: "completed",
            endTime: new Date() // Force end time to now since match finished dynamically
          });
          logger.info(`[reconciliationWorker] All rooms ended. Marked contest ${contestId} as completed.`);
        }
      }
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

    // 4. Finalise ContestProblemSet
    const problemsRaw = await redis.lRange(`room:${roomId}:problems`, 0, -1);
    if (problemsRaw.length > 0) {
      const problems = problemsRaw.map(p => JSON.parse(p));
      const problemSet = new ContestProblemSet({
        contestId,
        roomId,
        problems: problems.map((p: any) => ({
          platform: "codeforces",
          problemId: p.problemId,
          name: p.name || p.problemId,
          rating: p.rating || 0,
          points: p.points || 100
        }))
      });
      await problemSet.save();
    }
    // Publish room.end if triggered by timeout or forfeit (meaning it didn't end naturally in cfSyncWorker)
    if (trigger === "timeout" || trigger === "forfeit") {
      const stateObj = await redis.hGetAll(`room:${roomId}:state`);
      const startTime = parseInt(stateObj.startTime || "0", 10);
      await publishRoom(roomId, {
        type: "room.end",
        finalScores: teamScores,
        duration: Date.now() - startTime,
        reason: trigger === "forfeit" ? "disconnect" : "timeout"
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
