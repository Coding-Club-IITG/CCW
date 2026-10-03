import { getRedis } from "@/lib/db/redis";

// Each set member is one connection - score is expiry
const updatePresenceScript = `
local key, now = KEYS[1], tonumber(ARGV[1])
local function users()
  local result = {}
  for _, connection in ipairs(redis.call('ZRANGE', key, 0, -1)) do
    result[string.sub(connection, 1, 24)] = true
  end
  return result
end
local before = users()
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
if ARGV[2] == 'refresh' then
  redis.call('ZADD', key, now + tonumber(ARGV[4]), ARGV[3])
elseif ARGV[2] == 'remove' then
  redis.call('ZREM', key, ARGV[3])
end
local after, online, joined, left = users(), {}, {}, {}
for user, _ in pairs(after) do
  table.insert(online, user)
  if not before[user] then table.insert(joined, user) end
end
for user, _ in pairs(before) do
  if not after[user] then table.insert(left, user) end
end
local latest = redis.call('ZRANGE', key, -1, -1, 'WITHSCORES')
if #latest > 0 then redis.call('PEXPIREAT', key, latest[2]) end
return {online, joined, left}
`;

export async function updateRoomPresence(
  roomId: string,
  operation: "refresh" | "remove" | "prune",
  connection?: { userId: string; id: string; expirySeconds: number },
) {
  const redis = await getRedis();
  const result = (await redis.eval(updatePresenceScript, {
    keys: [`room:${roomId}:presence_connections`],
    arguments: [
      String(Date.now()),
      operation,
      connection ? `${connection.userId}:${connection.id}` : "",
      String((connection?.expirySeconds ?? 0) * 1000),
    ],
  })) as [string[], string[], string[]];

  return {
    onlineUserIds: result[0],
    joinedUserIds: result[1],
    leftUserIds: result[2],
  };
}

export async function getRoomOnlineUserIds(roomId: string) {
  const redis = await getRedis();
  const connections = await redis.zRangeByScore(
    `room:${roomId}:presence_connections`,
    Date.now() + 1,
    "+inf",
  );

  return [...new Set(connections.map((connection) => connection.slice(0, 24)))];
}
