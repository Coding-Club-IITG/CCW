import mongoose from "mongoose";

import { sharedServerEnv } from "@/lib/env/shared";

const MONGODB_URI = sharedServerEnv.MONGODB_URI;

// Automatically attach the active transaction session to nested Mongoose
// operations, including complex bracket domain workflows.
mongoose.set("transactionAsyncLocalStorage", true);

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections from growing exponentially
 * during API Route usage.
 */
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export const getClient = async () => {
  await dbConnect();
  return mongoose.connection.getClient();
};

export default dbConnect;
