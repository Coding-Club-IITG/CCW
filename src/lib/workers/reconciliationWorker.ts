import { type Job, Worker } from "bullmq";

import { publishRoom } from "@/lib/contests/events";
import {
  contestRoomProblemSchema,
  contestRoomStateSchema,
  contestSubmissionEventSchema,
  parseContestRoomProblems,
  reconciliationJobDataSchema,
  type ContestRoomState,
  type ReconciliationJobData,
  type ReconciliationJobName,
} from "@/lib/contests/runtime";
import { workerEnv } from "@/lib/env/worker";
import dbConnect from "@/lib/mongodb";
import { notify } from "@/lib/notify";
import { bullMqConnection } from "@/lib/bullmq";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/utils";
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

      if (a.avgRating !== b.avgRating) return a.avgRating - b.avgRating;

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
    let { roomId, contestId, trigger, forfeitedUserId, teamId, userId } =
      reconciliationJobDataSchema.parse(job.data);
    const redis = await getRedis();
    await dbConnect();

    // Handle team ready timeout
    if (job.name === "team_ready_timeout") {
      const state = contestRoomStateSchema.parse(
        await redis.hGetAll(`room:${roomId}:state`),
      );

      // Only process if room is still waiting
      if (state && state.status === "waiting") {
        const teamMembers = await redis.sMembers(`team:${teamId}:users`);
        const readyMembers = [];
        for (const memberId of teamMembers) {
          const isReady = await redis.sIsMember(
            `room:${roomId}:ready_users`,
            memberId,
          );
          if (isReady) {
            readyMembers.push(memberId);
          }
        }

        const allReady = readyMembers.length === teamMembers.length;
        if (!allReady) {
          // Team is not ready within 60s, withdraw the entire team
          logger.info(
            `[reconciliationWorker] Team ${teamId} not ready within 60s, withdrawing from room ${roomId}`,
          );

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
            reason: "ready_timeout",
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
              reason: "team_withdrawal",
            });
          }
        }
      }
      return;
    }

    // Handle starting registration for scheduled brackets
    if (job.name === "start_registration" || trigger === "start_registration") {
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
    if (job.name === "check_start" || trigger === "check_start") {
      const contest = await ContestMatch.findById(contestId);
      if (!contest) return;

      // ── Bracket tournaments: generate bracket here (single entry point) ──
      if (contest.format === "bracket") {
        if (contest.registrations && contest.registrations.length < 2) {
          logger.info(
            `[reconciliationWorker] check_start: bracket ${contestId} has insufficient registrations. Canceling.`,
          );
          await ContestMatch.findByIdAndDelete(contestId);
          const creator = await CPUser.findById(contest.creatorId);
          if (creator && creator.userId) {
            await notify({
              userId: String(creator.userId),
              type: "announcement",
              title: "Tournament Cancelled",
              message: `Your bracket tournament '${contest.name}' was cancelled due to insufficient registrations.`,
              link: "/internal/contests",
            });
          }
          return;
        }

        contest.status = "provisioning";
        await contest.save();

        const bracketUserIds = (contest.registrations || []).map(
          (registration) => registration.userId.toString(),
        );

        // Incremental CF sync for all bracket registrants
        // OPTIMIZATION: Only do this if problemSelectionMode is "bulk"
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
                  // If the very last (oldest) submission in this chunk is still newer than latestSolvedMs, fetch more.
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
            { contestId: contestId.toString(), trigger: "activate_bracket" },
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
          await ContestMatch.findByIdAndDelete(contestId);
          const creator = await CPUser.findById(contest.creatorId);
          if (creator && creator.userId) {
            await notify({
              userId: String(creator.userId),
              type: "announcement",
              title: "Tournament Failed",
              message: `Your bracket tournament '${contest.name}' failed to generate (likely due to 0 suitable problems found).`,
              link: "/internal/contests",
            });
          }
        }
        return;
      }

      // ── Non-bracket contests: existing team-grouping + provisioning logic ──

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
      const minRating = contest.bulkRatingMin || 800;
      const maxRating = contest.bulkRatingMax || 1200;
      const minContestId = contest.bulkMinContestId || 0;

      const allUserIds = validTeams.flatMap((t) => t[1]);

      // --- Incremental CF submission fetch to get fresh solved problem data ---
      // For each registered user: find the most recent solved problem timestamp in DB,
      // fetch any new ACs from CF API since then, and update CPUser.solvedProblems.
      // OPTIMIZATION: Only do this if problemSelectionMode is "bulk", because "test" mode
      // uses manual problem slots and ignores the solved array anyway!
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
              rating: { $gte: minRating, $lte: maxRating },
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
        problems: availableProblems.map((problem) => ({
          platform: "codeforces",
          problemId: problem.problemId,
          name: problem.name,
          rating: problem.rating,
          points:
            problem.points ??
            (problem.rating ? Math.floor(problem.rating / 10) : 100),
          timeLimitMinutes: problem.timeLimitMinutes,
        })),
      });

      const teamSize = contest.teamSize || 1;
      const createdTeams = [];
      for (const t of validTeams) {
        const team = new ContestTeam({
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

      await room.save();
      await problemSet.save();

      const newRoomId = room._id.toString();

      const redisProblems = availableProblems.map((problem) =>
        JSON.stringify({
          problemId: problem.problemId,
          name: problem.name,
          rating: problem.rating,
          points:
            problem.points ??
            (problem.rating ? Math.floor(problem.rating / 10) : 100),
          timeLimitMinutes: problem.timeLimitMinutes,
          revealedAt: null,
        }),
      );
      await redis.del(`room:${newRoomId}:problems`);
      if (redisProblems.length > 0) {
        await redis.rPush(`room:${newRoomId}:problems`, redisProblems);
      }

      const durationSec = contest.overallDurationMinutes
        ? contest.overallDurationMinutes * 60
        : contest.durationSeconds || 3600;

      const stateObj: Record<string, string | number> = {
        status: "pending",
        type: contest.mode || "blitz",
        startTime: "", // Empty for now, set when all ready
        timeLimit: durationSec.toString(),
        contestId: contestId.toString(),
        readyCount: 0,
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

      // Schedule the job to open the room at the configured startTime
      // Fire ROOM_PRE_START_SECONDS before startTime so the room is "waiting" by the time
      // the client-side timer triggers at startTime - prevents a "No Room Found" race condition.
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
          trigger: "start_waiting_room",
        },
        { delay: delayToStart, jobId: `start-waiting-${newRoomId}` },
      );

      logger.info(
        `[reconciliationWorker] Successfully provisioned room ${newRoomId}. Scheduled start_waiting_room in ${delayToStart}ms (${preStartSeconds}s before startTime).`,
      );
      return;
    }

    // Handle activating a bracket contest exactly 5 seconds before start time
    if (job.name === "activate_bracket" || trigger === "activate_bracket") {
      const contest = await ContestMatch.findById(contestId);
      if (!contest) return;

      if (contest.status !== "active") {
        contest.status = "active";
        await contest.save();
        await redis.hSet(`contest:${contestId}:meta`, { status: "active" });

        logger.info(
          `[reconciliationWorker] activate_bracket: contest ${contestId} is now active.`,
        );
      }
      return;
    }

    // Handle starting the waiting room (making it visible to users)
    if (job.name === "start_waiting_room" || trigger === "start_waiting_room") {
      const contest = await ContestMatch.findById(contestId);
      const room = await ContestRoom.findById(roomId);
      if (!contest || !room) return;

      room.status = "waiting";
      await room.save();

      if (contest.status !== "active") {
        contest.status = "active";
        await contest.save();
      }

      await redis.hSet(`room:${roomId}:state`, { status: "waiting" });

      // Publish SSE event that room is now waiting
      await publishRoom(roomId, {
        type: "room.state_sync",
        roomId,
        state: await redis.hGetAll(`room:${roomId}:state`),
      });

      logger.info(
        `[reconciliationWorker] Room ${roomId} is now waiting for players.`,
      );

      // Schedule a ready_timeout to cancel if players don't ready up in time
      const timeoutMins = workerEnv.ROOM_READY_TIMEOUT_MINUTES;
      const { reconciliationQueue } = await import("@/lib/contests/queues");
      await reconciliationQueue.add(
        "ready_timeout",
        { roomId, contestId: contestId.toString() },
        { delay: timeoutMins * 60000, jobId: `ready-timeout-${roomId}` },
      );

      return;
    }

    // Handle ready timeout (if not all players clicked ready within grace period)
    if (job.name === "ready_timeout") {
      const state = await redis.hGetAll(`room:${roomId}:state`);

      // If room is still waiting, it means not everyone clicked ready
      if (state && state.status === "waiting") {
        // Fetch contest before deleting or force-starting
        const c = await ContestMatch.findById(contestId).lean();

        // For brackets, NEVER cancel the tournament. Instead, force-start the match!
        if (c && c.format === "bracket") {
          logger.info(
            `[reconciliationWorker] Room ${roomId} ready timeout hit, but it's a bracket. Force-starting the match!`,
          );

          const room = await ContestRoom.findById(roomId);
          if (room) {
            const now = Date.now();

            // Reveal the problem
            const problemsRaw = await redis.lRange(
              `room:${roomId}:problems`,
              0,
              -1,
            );
            if (problemsRaw.length > 0) {
              const firstProblem = contestRoomProblemSchema.parse(
                JSON.parse(problemsRaw[0]),
              );
              firstProblem.revealedAt = now;
              await redis.lSet(
                `room:${roomId}:problems`,
                0,
                JSON.stringify(firstProblem),
              );
            }

            // Update DB and Redis
            room.status = "active";
            room.actualStartTime = new Date(now);
            await room.save();
            await redis.hSet(`room:${roomId}:state`, {
              status: "active",
              startTime: now.toString(),
            });

            // Re-fetch and sync to clients
            const updatedState = await redis.hGetAll(`room:${roomId}:state`);
            const updatedProblemsRaw = await redis.lRange(
              `room:${roomId}:problems`,
              0,
              -1,
            );
            const updatedProblems =
              parseContestRoomProblems(updatedProblemsRaw);
            const teamIds = await redis.sMembers(`room:${roomId}:teams`);
            const scores: Record<string, number> = {};
            for (const tId of teamIds) {
              const score = await redis.zScore(`room:${roomId}:scores`, tId);
              scores[tId] = score || 0;
            }

            await publishRoom(roomId, {
              type: "room.state_sync",
              roomId,
              state: updatedState,
              problems: updatedProblems,
              scores,
            });

            // Start the match timer
            const timeLimitSecs = parseInt(state.timeLimit || "3600", 10);
            const { reconciliationQueue } =
              await import("@/lib/contests/queues");
            await reconciliationQueue.add(
              "room_timeout",
              { roomId, contestId: contestId.toString(), trigger: "timeout" },
              { delay: timeLimitSecs * 1000, jobId: `timeout-${roomId}` },
            );
          }
          return;
        }

        logger.info(
          `[reconciliationWorker] Room ${roomId} ready timeout hit. Canceling contest.`,
        );

        // Collect team IDs before any deletion so we can clean up team-scoped Redis keys
        const teamIds = await redis.sMembers(`room:${roomId}:teams`);
        if (c) {
          // Notify creator
          const creator = await CPUser.findById(c.creatorId);
          if (creator && creator.userId) {
            await notify({
              userId: String(creator.userId),
              type: "announcement",
              title: "Contest Cancelled",
              message: `Your contest '${c.name}' was cancelled because players didn't click Ready in time.`,
              link: "/internal/contests",
            });
          }
        }

        // Remove room/contest data to abort
        await ContestMatch.findByIdAndDelete(contestId);
        await ContestRoom.findByIdAndDelete(roomId);

        // Clean up room-scoped Redis keys
        const keys = await redis.keys(`room:${roomId}:*`);
        if (keys.length > 0) {
          await redis.del(keys);
        }

        // Clean up team-scoped Redis keys (not covered by room:${roomId}:* pattern)
        for (const tId of teamIds) {
          await redis.del(`team:${tId}:meta`);
          await redis.del(`team:${tId}:users`);
        }

        // Clean up contest-scoped Redis key
        if (contestId) {
          await redis.del(`contest:${contestId}:rooms`);
        }

        await publishRoom(roomId, {
          type: "room.end",
          reason: "ready_timeout",
        });
      }
      return;
    }

    // Handle natural room completion (all problems solved/locked in cfSyncWorker)
    // This handler is intentionally lean: it does NOT create a new ContestProblemSet
    // (one was already created during provisioning). It only finalises scores and cleans up.
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
        for (const tId of completedTeams) {
          const score = await redis.zScore(`room:${roomId}:scores`, tId);
          await ContestTeam.findByIdAndUpdate(tId, { score: score || 0 });
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
          submittedAt: new Date(data.cfTimestamp || Date.now()),
        });
        await submission.save();
      }

      // Finally, update the room status to "ended"
      if (completedRoom) {
        completedRoom.status = "ended";
        await completedRoom.save();

        // For bracket contests: advance winner + check round completion
        if (contestId) {
          const completedContest =
            await ContestMatch.findById(contestId).lean();
          if (completedContest?.format === "bracket") {
            const stateObj = await redis.hGetAll(`room:${roomId}:state`);
            const { winnerId: bracketWinnerId } = await determineWinner(
              redis,
              roomId,
              completedTeams,
              stateObj,
            );

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

            // Bracket: clean up ONLY room-scoped and team-scoped keys
            // Contest-level keys (contest:${contestId}:meta, contest:${contestId}:rooms) must persist
            // until the entire tournament is finished (handled by advanceWinner / checkRoundCompletion).
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
            status: { $in: ["ended", "completed"] },
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
        await redis.del(`contest:${contestId}:rooms`);
      }

      logger.info(
        `[reconciliationWorker] room_completed: finished cleanup for room ${roomId}.`,
      );
      return;
    }

    // Note: end_registration handler has been removed.
    // Bracket generation is now handled entirely inside check_start for a single entry point.

    // Handle mid-match disconnect timeout
    if (job.name === "mid_match_disconnect_timeout") {
      const disconnectedUserId = userId;

      // Check if user is still offline
      const presenceKey = `room:${roomId}:presence:${disconnectedUserId}`;
      const isOnline = await redis.exists(presenceKey);
      const state = await redis.hGetAll(`room:${roomId}:state`);

      if (!isOnline && state && state.status === "active") {
        logger.info(
          `[reconciliationWorker] User ${disconnectedUserId} disconnected for too long in room ${roomId}. Forfeiting.`,
        );
        // Find which team this user belongs to
        const allTeams = await redis.sMembers(`room:${roomId}:teams`);
        let forfeitedTeamId = null;
        for (const tId of allTeams) {
          const isMember = await redis.sIsMember(
            `team:${tId}:users`,
            disconnectedUserId,
          );
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
        logger.info(
          `[reconciliationWorker] mid_match_disconnect_timeout ignored for ${disconnectedUserId} (isOnline=${isOnline}, status=${state?.status})`,
        );
        return;
      }
    }

    // Original reconciliation logic continues below
    const teams = await redis.sMembers(`room:${roomId}:teams`);
    if (teams.length === 0) {
      logger.info(
        `[reconciliationWorker] No teams found in Redis for room ${roomId}. Room likely already processed. Skipping.`,
      );
      return;
    }
    const stateObj = await redis.hGetAll(`room:${roomId}:state`);
    let { winnerId, teamScores } = await determineWinner(
      redis,
      roomId,
      teams,
      stateObj,
    );

    // Handle forfeit winner if provided
    if (trigger === "forfeit" && forfeitedUserId) {
      // Find the team that the forfeited user does NOT belong to
      for (const tId of teams) {
        const isMember = await redis.sIsMember(
          `team:${tId}:users`,
          forfeitedUserId,
        );
        if (!isMember) {
          winnerId = tId;
          break;
        }
      }
    }

    // 2. Write to MongoDB
    const room = await ContestRoom.findById(roomId);
    if (room) {
      if (trigger === "forfeit") room.terminationReason = "disconnect";
      else if (trigger === "timeout") room.terminationReason = "timeout";

      // We don't have an explicit winner field in IContestRoom schema according to Stage 1,
      // but if we do, we could set it. The prompt says: "Write final ContestRoom (scores, winner, endTime, trigger)."
      // Let's assume we update the team scores.
      for (const tId of teams) {
        await ContestTeam.findByIdAndUpdate(tId, { score: teamScores[tId] });
      }
    }

    // 2.5 Bracket advancement hook - now handled in room_completed. This path covers
    // forfeit/timeout endings for bracket rooms.
    if (contestId) {
      try {
        const bracketContest = await ContestMatch.findById(contestId).lean();
        if (bracketContest?.format === "bracket" && winnerId) {
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
        submittedAt: new Date(data.cfTimestamp || Date.now()),
      });
      await submission.save();
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
      room.status = "ended";
      await room.save();

      // Approach 1: Global Backend Aggregation for ContestMatch
      if (contestId) {
        const totalRooms = await ContestRoom.countDocuments({ contestId });
        const endedRooms = await ContestRoom.countDocuments({
          contestId,
          status: { $in: ["ended", "completed"] },
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
    // Publish room.end if triggered by timeout or forfeit (meaning it didn't end naturally in cfSyncWorker)
    if (trigger === "timeout" || trigger === "forfeit") {
      const stateObj = await redis.hGetAll(`room:${roomId}:state`);
      const startTime = parseInt(stateObj.startTime || "0", 10);
      await publishRoom(roomId, {
        type: "room.end",
        finalScores: teamScores,
        duration: Date.now() - startTime,
        reason: trigger === "forfeit" ? "disconnect" : "timeout",
      });
      await redis.hSet(`room:${roomId}:state`, { status: "completed" });
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
    lockDuration: 600000, // Extended lock to 10 minutes (600,000 ms) for long API polling loop
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
