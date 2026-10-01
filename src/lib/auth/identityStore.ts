import mongoose, { type ClientSession } from "mongoose";

import { getMongoClient } from "@/lib/db/mongodb";

export const AUTH_COLLECTIONS = {
  account: "account",
  session: "session",
  verification: "verification",
} as const;

export function authUserId(userId: string) {
  return new mongoose.Types.ObjectId(userId);
}

export async function authCollections() {
  const db = (await getMongoClient()).db();
  return {
    accounts: db.collection(AUTH_COLLECTIONS.account),
    sessions: db.collection(AUTH_COLLECTIONS.session),
    verifications: db.collection(AUTH_COLLECTIONS.verification),
  };
}

export async function removeAuthRecords(
  userId: string,
  session: ClientSession,
  accounts = true,
) {
  const store = await authCollections();
  const filter = { userId: { $in: [authUserId(userId), userId] } };
  const sessionsResult = await store.sessions.deleteMany(filter, { session });
  const accountsResult = accounts
    ? await store.accounts.deleteMany(filter, { session })
    : null;
  return {
    sessions: sessionsResult.deletedCount,
    accounts: accountsResult?.deletedCount ?? 0,
  };
}
