import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/utils";
import { publishRoom } from "@/lib/sse";
import { reconciliationQueue } from "@/lib/bullmq";

export async function startPresenceKeyspaceListener() {
  logger.info("[PresenceListener] Starting Redis keyspace notification listener...");

  try {
    const redis = await getRedis();
    const subscriber = redis.duplicate();
    await subscriber.connect();


    await subscriber.pSubscribe("__keyevent@*__:expired", async (key, channel) => {
      // Match pattern: room:<roomId>:presence:<userId>
      const match = key.match(/^room:([^:]+):presence:([^:]+)$/);
      if (!match) return;

      const roomId = match[1];
      const userId = match[2];


      const lockKey = `room:${roomId}:presence:${userId}:expire_lock`;
      const acquired = await redis.set(lockKey, "1", { NX: true, EX: 10 });
      if (!acquired) {
        return; // Expiration already processed by another worker
      }

      logger.info(`[PresenceListener] Presence expired for user ${userId} in room ${roomId}.`);

      try {
        // Trigger auto-forfeit 
        logger.info(`[PresenceListener] User ${userId} auto-forfeited in room ${roomId} due to inactivity.`);
        
        const state = await redis.hGetAll(`room:${roomId}:state`);
        if (state && state.status === "active") {
          await redis.hSet(`room:${roomId}:state`, { forfeitFlag: "true" });
          
          await reconciliationQueue.add(
            "room_forfeit",
            { roomId, contestId: state.contestId, trigger: "forfeit", forfeitedUserId: userId },
            { jobId: `forfeit:${roomId}:${userId}` }
          );

          // Need teamId. Find it from the sets
          const teams = await redis.sMembers(`room:${roomId}:teams`);
          let userTeamId = null;
          for (const tId of teams) {
            const isMember = await redis.sIsMember(`team:${tId}:users`, userId);
            if (isMember) {
              userTeamId = tId;
              break;
            }
          }

          await publishRoom(roomId, {
            type: "room.player_forfeited",
            userId,
            teamId: userTeamId
          });
        }

        // Check if offline event has been sent
        const offlineSentKey = `room:${roomId}:presence:${userId}:offline_sent`;
        const offlineSentExists = await redis.exists(offlineSentKey);

        if (!offlineSentExists) {
          logger.info(`[PresenceListener] Offline event not yet published for user ${userId} in room ${roomId}. Publishing now.`);
          await publishRoom(roomId, { type: "presence.offline", userId });
        } else {
          // Clean up the helper
          await redis.del(offlineSentKey);
        }
      } catch (err) {
        logger.error(`[PresenceListener] Error handling presence expiration for user ${userId} in room ${roomId}:`, err);
      }
    });

    logger.info("[PresenceListener] Successfully subscribed to keyspace expired events.");
  } catch (err) {
    logger.error("[PresenceListener] Failed to start Redis keyspace notification listener:", err);
  }
}
