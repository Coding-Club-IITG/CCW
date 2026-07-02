import { createClient } from "redis";
async function r() {
  const redis = createClient({ url: "redis://localhost:6379" });
  await redis.connect();
  const keys = await redis.keys("room:6a469f68852f195e32d5de1d:*");
  console.log(keys);
  await redis.disconnect();
}
r();
