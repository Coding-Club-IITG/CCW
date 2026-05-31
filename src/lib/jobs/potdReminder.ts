/**
 * POTD reminder job
 * Sends notifications to users who haven't solved today's POTD 6 hours before closing.
 */

import dbConnect from "@/lib/mongodb";
import DailyChallenge from "@/models/POTDDailyChallenge";
import POTDSubmission from "@/models/POTDSubmission";
import Notification from "@/models/Notification";
import User from "@/models/User";
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

  for (const challenge of challenges as any[]) {
    // Get users who already submitted for this challenge
    const submissions = await POTDSubmission.find({
      challengeId: challenge._id,
    })
      .select("userId")
      .lean();
    const solvedUserIds = new Set(
      (submissions as any[]).map((s) => s.userId.toString()),
    );

    // Get all users
    const allUsers = await User.find({}).select("_id").lean();
    const unsolvedUsers = (allUsers as any[]).filter(
      (u) => !solvedUserIds.has(u._id.toString()),
    );

    if (unsolvedUsers.length === 0) continue;

    const notifications = unsolvedUsers.map((u) => ({
      userId: u._id.toString(),
      type: "potd_reminder" as const,
      title: "POTD Closing Soon",
      message: `Today's ${challenge.difficulty} problem closes in ~6 hours. Don't miss your streak!`,
      link: "/internal/potd",
    }));

    await Notification.insertMany(notifications, { ordered: false });
    logger.info(
      `[potd-reminder] Sent ${notifications.length} reminders for ${challenge.difficulty} challenge`,
    );
  }
}
