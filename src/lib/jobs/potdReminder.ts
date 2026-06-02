/**
 * POTD reminder job
 * Sends a notification to users who haven't solved at least one of today's POTDs
 * 6 hours before closing.
 */

import dbConnect from "@/lib/mongodb";
import DailyChallenge from "@/models/POTDDailyChallenge";
import POTDSubmission from "@/models/POTDSubmission";
import User from "@/models/User";
import { notifyMany } from "@/lib/notify";
import { logger } from "@/lib/utils";

export async function sendPOTDReminders() {
  await dbConnect();

  const now = new Date();

  // Find today's challenges that are closing within the next 6-7 hours
  const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const sevenHoursLater = new Date(now.getTime() + 7 * 60 * 60 * 1000);

  const challenges = await DailyChallenge.find({
    windowEnd: { $gte: sixHoursLater, $lte: sevenHoursLater },
  }).lean();

  if (challenges.length === 0) return;

  // Collect users who solved at least one of today's challenges
  const solvedUserIds = new Set<string>();
  for (const challenge of challenges as any[]) {
    const submissions = await POTDSubmission.find({
      challengeId: challenge._id,
    })
      .select("userId")
      .lean();
    for (const s of submissions as any[]) {
      solvedUserIds.add(s.userId.toString());
    }
  }

  // Get all users who haven't solved any challenge
  const allUsers = await User.find({}).select("_id").lean();
  const unsolvedUsers = (allUsers as any[]).filter(
    (u) => !solvedUserIds.has(u._id.toString()),
  );

  if (unsolvedUsers.length === 0) return;

  const difficulties = (challenges as any[]).map((c) => c.difficulty);
  const difficultyText =
    difficulties.length === 1
      ? `a ${difficulties[0]} problem`
      : `${difficulties.length} problems (${difficulties.join(", ")})`;

  const userIds = unsolvedUsers.map((u) => u._id.toString());
  await notifyMany(userIds, {
    type: "potd_reminder",
    title: "POTD Closing Soon",
    message: `Today's ${difficultyText} closing in ~6 hours. Don't miss your streak!`,
    link: "/internal/potd",
  });
  logger.info(
    `[potd-reminder] Sent ${userIds.length} reminders for ${difficulties.join(", ")} challenges`,
  );
}
