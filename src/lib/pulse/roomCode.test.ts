import { describe, expect, it, vi } from "vitest";

import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_MAX_ATTEMPTS,
} from "@/lib/pulse/constants";
import {
  RoomCodeExhaustedError,
  generateRoomCode,
  normalizeRoomCode,
  withUniqueRoomCode,
} from "@/lib/pulse/roomCode";

const roomCodeDuplicate = () =>
  Object.assign(new Error("E11000 duplicate key"), {
    code: 11000,
    keyPattern: { roomCode: 1 },
    keyValue: { roomCode: "AAAAAA" },
  });

describe("generateRoomCode", () => {
  it("uses only the safe alphabet and the configured length", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect([...code].every((c) => ROOM_CODE_ALPHABET.includes(c))).toBe(true);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it("does not return the same code every time", () => {
    const codes = new Set(Array.from({ length: 50 }, generateRoomCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("normalizeRoomCode", () => {
  it("trims, uppercases and strips separators", () => {
    expect(normalizeRoomCode(" a7k-9p2 ")).toBe("A7K9P2");
    expect(normalizeRoomCode("a7k 9p2")).toBe("A7K9P2");
  });

  it("returns null for invalid input", () => {
    for (const bad of [
      "A7K9P0",
      "SHORT",
      "A7K9P23",
      "",
      123,
      null,
      undefined,
    ]) {
      expect(normalizeRoomCode(bad)).toBeNull();
    }
  });
});

describe("withUniqueRoomCode", () => {
  it("returns the first result when there is no collision", async () => {
    const create = vi.fn(async (code: string) => code);
    await expect(
      withUniqueRoomCode(create, { generate: () => "A7K9P2" }),
    ).resolves.toBe("A7K9P2");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries on collision and then succeeds", async () => {
    const codes = ["AAAAAA", "BBBBBB", "CCCCCC"];
    const generate = vi.fn(() => codes.shift()!);
    const create = vi
      .fn<(code: string) => Promise<string>>()
      .mockRejectedValueOnce(roomCodeDuplicate())
      .mockRejectedValueOnce(roomCodeDuplicate())
      .mockImplementation(async (code) => code);

    await expect(withUniqueRoomCode(create, { generate })).resolves.toBe(
      "CCCCCC",
    );
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("throws RoomCodeExhaustedError after maxAttempts", async () => {
    const create = vi.fn().mockRejectedValue(roomCodeDuplicate());
    await expect(
      withUniqueRoomCode(create, { maxAttempts: 4, generate: () => "AAAAAA" }),
    ).rejects.toBeInstanceOf(RoomCodeExhaustedError);
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("defaults to ROOM_CODE_MAX_ATTEMPTS", async () => {
    const create = vi.fn().mockRejectedValue(roomCodeDuplicate());
    await expect(withUniqueRoomCode(create)).rejects.toBeInstanceOf(
      RoomCodeExhaustedError,
    );
    expect(create).toHaveBeenCalledTimes(ROOM_CODE_MAX_ATTEMPTS);
  });

  it("rethrows non-duplicate errors immediately", async () => {
    const boom = new Error("connection lost");
    const create = vi.fn().mockRejectedValue(boom);
    await expect(withUniqueRoomCode(create)).rejects.toBe(boom);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rethrows duplicates on a different key immediately", async () => {
    const other = Object.assign(new Error("dup"), {
      code: 11000,
      keyPattern: { somethingElse: 1 },
      keyValue: { somethingElse: "x" },
    });
    const create = vi.fn().mockRejectedValue(other);
    await expect(withUniqueRoomCode(create)).rejects.toBe(other);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
