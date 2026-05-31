/**
 * Hackathon deadline reminder job
 * Sends notifications to unregistered users 2 days before hackathon deadline.
 */

import dbConnect from "@/lib/mongodb";
import Hackathon from "@/models/Hackathon";
import HackathonTeam from "@/models/HackathonTeam";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { logger } from "@/lib/utils";

export async function sendHackathonDeadlineReminders() {
  await dbConnect();

  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const twoDaysPlus1h = new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000);

  // Find hackathons with deadline between 2 days and 2 days + 1 hour from now
  const hackathons = await Hackathon.find({
    status: "active",
    deadline: { $gte: twoDaysFromNow, $lte: twoDaysPlus1h },
  }).lean();

  if (hackathons.length === 0) return;

  for (const hackathon of hackathons as any[]) {
    // Get all users who are already in a team
    const teams = await HackathonTeam.find({
      hackathonId: hackathon._id,
    }).lean();
    const registeredUserIds = new Set(
      (teams as any[]).flatMap((t) => t.members),
    );

    // Get all users not yet registered
    const allUsers = await User.find({}).select("_id").lean();
    const unregisteredUsers = (allUsers as any[]).filter(
      (u) => !registeredUserIds.has(u._id.toString()),
    );

    if (unregisteredUsers.length === 0) continue;

    const notifications = unregisteredUsers.map((u) => ({
      userId: u._id.toString(),
      type: "hackathon_reminder" as const,
      title: "Hackathon Deadline Approaching",
      message: `"${hackathon.name}" deadline is in 2 days! Find a team before it's too late.`,
      link: `/internal/hackathons/${hackathon._id}`,
    }));

    await Notification.insertMany(notifications, { ordered: false });
    logger.info(
      `[hackathon-reminder] Sent ${notifications.length} reminders for "${hackathon.name}"`,
    );
  }
}
