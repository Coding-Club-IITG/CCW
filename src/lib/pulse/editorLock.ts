import { randomBytes } from "node:crypto";
import mongoose, { type Types } from "mongoose";

import {
  PULSE_EDITABLE_STATUSES,
  PULSE_EDITOR_LOCK_TTL_MS,
} from "@/lib/pulse/constants";
import { getDisplayName } from "@/lib/utils";
import PulseQuiz from "@/models/PulseQuiz";
import User from "@/models/User";

/**
 * Editor lock, kept in MongoDB only: `PulseQuiz.editorLock` is `{ lockedBy, lockedAt,
 * expiresAt, token }`. The lock expires at `expiresAt` and nothing extends it, so an
 * abandoned tab releases it by itself after the TTL. The token is random per acquire
 * and is a fencing token: the deck save matches on it, so a holder who lost the lock
 * can't write. It is only ever returned to the host who just acquired the lock.
 */

export type EditorLockHolder = { name: string };
export type EditorLockAcquireResult =
  | { acquired: true; lockToken: string; expiresAt: Date }
  | { acquired: false; holder: EditorLockHolder | null };

const objectId = (id: string) => new mongoose.Types.ObjectId(id);

export async function describeLockHolder(userId: Types.ObjectId | string | null | undefined): Promise<EditorLockHolder | null> {
  if (!userId) return null;
  const user = await User.findById(userId).select("name email pizza_count").lean();
  return user ? { name: getDisplayName(user.name ?? user.email ?? "", user.pizza_count ?? 0) } : null;
}

/**
 * One atomic update that succeeds only if the lock is free, expired, or already held by
 * this user. It writes a new random token and `expiresAt = now + TTL`, so two concurrent
 * acquires can't both win, and a user re-acquiring replaces their own previous token.
 */
export async function acquireEditorLock(quizId: string, actor: { userId: string }): Promise<EditorLockAcquireResult> {
  const now = new Date();
  const userId = objectId(actor.userId);
  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(now.getTime() + PULSE_EDITOR_LOCK_TTL_MS);
  const claimed = await PulseQuiz.findOneAndUpdate(
    {
      _id: quizId,
      status: { $in: PULSE_EDITABLE_STATUSES },
      $or: [
        { "editorLock.lockedBy": null },
        { "editorLock.expiresAt": null },
        { "editorLock.expiresAt": { $lte: now } },
        { "editorLock.lockedBy": userId },
      ],
    },
    { $set: { editorLock: { lockedBy: userId, lockedAt: now, expiresAt, token } } },
    { projection: { _id: 1 } },
  ).lean();
  if (claimed) return { acquired: true, lockToken: token, expiresAt };

  // Someone else holds an unexpired lock: report the display name only, never the token.
  const current = await PulseQuiz.findById(quizId).select("editorLock").lean();
  return { acquired: false, holder: await describeLockHolder(current?.editorLock?.lockedBy) };
}

/** Clears the lock only if `token` is still the holder's; a stale token releases nothing. */
export async function releaseEditorLock(quizId: string, userId: string, token: string): Promise<{ released: boolean }> {
  const cleared = await PulseQuiz.updateOne(
    { _id: quizId, "editorLock.lockedBy": objectId(userId), "editorLock.token": token },
    { $set: { editorLock: { lockedBy: null, lockedAt: null, expiresAt: null, token: null } } },
  );
  return { released: cleared.modifiedCount > 0 };
}
