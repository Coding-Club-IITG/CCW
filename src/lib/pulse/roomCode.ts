import { randomInt } from "node:crypto";

import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_MAX_ATTEMPTS,
  ROOM_CODE_PATTERN,
} from "@/lib/pulse/constants";

export class RoomCodeExhaustedError extends Error {
  constructor(attempts: number) {
    super(`Could not allocate a unique room code after ${attempts} attempts.`);
    this.name = "RoomCodeExhaustedError";
  }
}

/** Cryptographically secure code; `randomInt` avoids modulo bias. */
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Canonical form for lookups, or null if the input can't be a valid code. */
export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

/** True only for a duplicate-key error on the roomCode index. */
function isRoomCodeCollision(error: unknown): boolean {
  const e = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
  };
  return (
    e?.code === 11000 &&
    ("roomCode" in (e.keyPattern ?? {}) || "roomCode" in (e.keyValue ?? {}))
  );
}

/**
 * Calls `create` with a fresh code, retrying only on a roomCode collision.
 * Any other error is rethrown immediately; after `maxAttempts` collisions it
 * throws RoomCodeExhaustedError.
 */
export async function withUniqueRoomCode<T>(
  create: (roomCode: string) => Promise<T>,
  options: { maxAttempts?: number; generate?: () => string } = {},
): Promise<T> {
  const { maxAttempts = ROOM_CODE_MAX_ATTEMPTS, generate = generateRoomCode } =
    options;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await create(generate());
    } catch (error) {
      if (!isRoomCodeCollision(error)) throw error;
    }
  }
  throw new RoomCodeExhaustedError(maxAttempts);
}
