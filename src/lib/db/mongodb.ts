import mongoose from "mongoose";

import { sharedServerEnv } from "@/lib/env/shared";

const MONGODB_URI = sharedServerEnv.MONGODB_URI;

// Automatically attach the active transaction session to nested Mongoose operations
mongoose.set("transactionAsyncLocalStorage", true);

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development
 */
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectMongoDB() {
  if (mongoose.connection.readyState === 1) {
    cached.conn = mongoose;
    return mongoose;
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    const uri = process.env.MONGODB_URI || MONGODB_URI;
    cached.promise = mongoose.connect(uri, opts).then((m) => {
      return m;
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

export const getMongoClient = async () => {
  await connectMongoDB();
  return mongoose.connection.getClient();
};
