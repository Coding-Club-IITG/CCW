import type { RedisClientType } from "redis";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import dbConnect from "@/lib/mongodb";

/**
 * Fetch and format the display name based on the selected standard:
 * "Team Name (User Name)" for team contests.
 * "User Name" for solo contests.
 * 
 * Includes caching in Redis via `user:{id}:meta` and `team:{id}:meta`.
 */
export async function getDisplayName(
  redis: any,
  userId: string,
  teamId?: string | null,
): Promise<string> {
  // 1. Fetch User Name
  let userName = "Unknown Player";
  try {
    const userMeta = await redis.hGetAll(`user:${userId}:meta`);
    if (userMeta && userMeta.name) {
      userName = userMeta.name;
    } else {
      await dbConnect();
      const user = await User.findById(userId).lean();
      if (user && user.name) {
        userName = user.name;
      } else {
        const cpUser = await CPUser.findOne({ userId }).lean();
        if (cpUser && cpUser.cfHandle) {
          userName = cpUser.cfHandle;
        }
      }
      
      // Cache it for next time
      await redis.hSet(`user:${userId}:meta`, { name: userName });
    }
  } catch (err) {
    console.error("[getDisplayName] Error fetching user name", err);
  }

  // 2. Fetch Team Name (if team exists and has > 1 members)
  if (teamId) {
    try {
      const teamMembersCount = await redis.sCard(`team:${teamId}:users`);
      if (teamMembersCount > 1) {
        let teamName = "Unknown Team";
        const teamMeta = await redis.hGet(`team:${teamId}:meta`, "name");
        if (teamMeta) {
          teamName = teamMeta;
        }
        return `${teamName} (${userName})`;
      }
    } catch (err) {
      console.error("[getDisplayName] Error fetching team meta", err);
    }
  }

  // 3. Return solo name if no team or team size is 1
  return userName;
}
