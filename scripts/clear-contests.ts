import "../src/lib/env";

import mongoose from "mongoose";
import { createClient } from "redis";

const MONGODB_URI = process.env.MONGODB_URI;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

async function clearContests() {
  try {
    await mongoose.connect(MONGODB_URI!);
    console.log("✅ Connected to MongoDB");

    const redis = createClient({ url: REDIS_URL });
    await redis.connect();
    console.log("✅ Connected to Redis");

    // 1. Clear MongoDB Collections
    console.log("\n🧹 Clearing MongoDB collections...");
    const collectionsToClear = [
      "custom_contests",
      "contest_rooms",
      "contest_teams",
      "contest_presets",
      "contest_registrations",
    ];

    const db = mongoose.connection.db;
    if (db) {
      for (const colName of collectionsToClear) {
        const collections = await db
          .listCollections({ name: colName })
          .toArray();
        if (collections.length > 0) {
          const result = await db.collection(colName).deleteMany({});
          console.log(
            `  🗑️  Deleted ${result.deletedCount} documents from ${colName}`,
          );
        } else {
          console.log(`  ⏭️  Collection ${colName} does not exist, skipping.`);
        }
      }
    }

    // 2. Clear Redis Keys
    console.log("\n🧹 Clearing Redis contest state...");
    const patterns = ["room:*", "team:*", "contest:*"];
    let totalRedisKeysDeleted = 0;

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
        totalRedisKeysDeleted += keys.length;
        console.log(`  🗑️  Deleted ${keys.length} keys matching '${pattern}'`);
      } else {
        console.log(`  ⏭️  No keys matching '${pattern}' found.`);
      }
    }
    console.log(`Total Redis keys deleted: ${totalRedisKeysDeleted}`);

    console.log(`\n✨ All contest data has been completely cleared!`);

    await mongoose.disconnect();
    await redis.disconnect();
  } catch (error) {
    console.error("❌ Error clearing data:", error);
    process.exit(1);
  }
}

clearContests();
