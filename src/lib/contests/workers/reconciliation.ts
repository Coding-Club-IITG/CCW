import { type Job, Worker } from "bullmq";

import { CONTEST_TIMING } from "@/lib/constants";

import { readyOrEnterRoom } from "@/lib/contests/participation";
import {
  synchronizeRoomRuntime,
  recoverRoomParticipation,
} from "@/lib/contests/roomRuntime";
import { reconcileMatch } from "@/lib/contests/gameplay";
import {
  reconciliationJobDataSchema,
  type ReconciliationJobData,
  type ReconciliationJobName,
} from "@/lib/contests/runtime";
import { workerEnv } from "@/lib/env/worker";
import { connectMongoDB } from "@/lib/db/mongodb";
import { notify } from "@/lib/notifications/service";
import { bullMqConnection } from "@/lib/queues/bullMq";
import { getRedis } from "@/lib/db/redis";
import { logger } from "@/lib/telemetry/logger";
import {
  createProvisionedRoom,
  provisionProblems,
  ProblemAllocationError,
} from "@/lib/contests/provisioning";
import CPUser from "@/models/CPUser";
import ContestMatch from "@/models/ContestMatch";
import ContestRoom from "@/models/ContestRoom";

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

    const { roomId, contestId } = reconciliationJobDataSchema.parse(job.data);
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

      // Incomplete rosters do not prevent complete teams from playing
      const validTeams = Array.from(teamsMap.entries()).filter(
        ([, members]) => members.length === requiredTeamSize,
      );

      if (validTeams.length < 2) {
        logger.info(
          `[reconciliationWorker] Contest ${contestId} did not meet minimum registration requirements. Canceling.`,
        );
        await ContestMatch.updateOne(
          { _id: contestId },
          {
            $set: {
              status: "completed",
              cancellationReason: "Not enough complete teams registered.",
              endTime: new Date(),
            },
          },
        );

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

      let allocation;

      try {
        allocation = await provisionProblems(contest, solvedProblemIds);
      } catch (error) {
        if (!(error instanceof ProblemAllocationError)) throw error;

        await ContestMatch.updateOne(
          { _id: contestId },
          {
            $set: {
              status: "completed",
              cancellationReason: error.message,
              endTime: new Date(),
            },
          },
        );
        return;
      }

      const room = await createProvisionedRoom(
        contestId,
        validTeams.map(([name, members]) => ({ name, members })),
        allocation.get("room")!,
        "pending",
      );
      const newRoomId = String(room._id);

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

    if (
      ["room_timeout", "problem_timeout", "finalize_match"].includes(job.name)
    ) {
      await reconcileMatch(roomId);
      return;
    }

    throw new Error("Unsupported contest reconciliation job");
  },
  {
    connection: bullMqConnection,
    concurrency: 1,
    lockDuration: CONTEST_TIMING.workerLockMs,
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
