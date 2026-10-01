import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import PulseAuditEvent, { validMetadata } from "@/models/PulseAuditEvent";

const id = () => new mongoose.Types.ObjectId();
const base = (extra: Record<string, unknown> = {}) => ({
  quizId: id(),
  type: "quiz.created",
  actor: { userId: id(), role: "owner" },
  ...extra,
});

describe("validMetadata", () => {
  it("accepts flat, bounded values", () => {
    expect(validMetadata({})).toBe(true);
    expect(
      validMetadata({ email: "a@b.co", count: 2, ok: true, none: null }),
    ).toBe(true);
    expect(validMetadata({ ids: ["a", "b"] })).toBe(true);
  });

  it("rejects non-objects, nesting and oversized values", () => {
    expect(validMetadata(null)).toBe(false);
    expect(validMetadata([])).toBe(false);
    expect(validMetadata({ nested: { a: 1 } })).toBe(false);
    expect(validMetadata({ text: "x".repeat(161) })).toBe(false);
    expect(validMetadata({ list: Array(13).fill("x") })).toBe(false);
    expect(validMetadata({ n: Number.POSITIVE_INFINITY })).toBe(false);
    expect(
      validMetadata(
        Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${i}`, 1])),
      ),
    ).toBe(false);
  });

  it("rejects secret-looking and malformed keys", () => {
    for (const key of [
      "recoveryToken",
      "passwordHash",
      "apiKey",
      "api_key",
      "clientSecret",
      "cookie",
      "Authorization",
      "credential",
    ]) {
      expect(validMetadata({ [key]: "x" })).toBe(false);
    }
    expect(validMetadata({ "bad key": "x" })).toBe(false);
  });
});

describe("PulseAuditEvent schema", () => {
  it.each(["quiz.created", "host.assigned", "host.removed", "host.linked"])(
    "accepts %s",
    async (type) => {
      const event = new PulseAuditEvent(base({ type }));
      await expect(event.validate()).resolves.toBeUndefined();
      expect(event.createdAt).toBeInstanceOf(Date);
    },
  );

  it("rejects unknown types and roles", async () => {
    await expect(
      new PulseAuditEvent(base({ type: "quiz.exploded" })).validate(),
    ).rejects.toThrow();
    await expect(
      new PulseAuditEvent(
        base({ actor: { userId: id(), role: "wizard" } }),
      ).validate(),
    ).rejects.toThrow();
  });

  it("rejects secrets in metadata", async () => {
    await expect(
      new PulseAuditEvent(
        base({ metadata: { recoveryToken: "x" } }),
      ).validate(),
    ).rejects.toThrow();
  });

  it("rejects a non-ObjectId actor or quiz id", async () => {
    await expect(
      new PulseAuditEvent(
        base({ actor: { userId: "user-1", role: "owner" } }),
      ).validate(),
    ).rejects.toThrow();
    await expect(
      new PulseAuditEvent(base({ quizId: "nope" })).validate(),
    ).rejects.toThrow();
  });

  it("indexes by quiz and time", () => {
    expect(PulseAuditEvent.schema.indexes()).toContainEqual([
      { quizId: 1, createdAt: 1 },
      expect.anything(),
    ]);
  });
});
