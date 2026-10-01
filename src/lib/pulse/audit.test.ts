import mongoose, { type ClientSession } from "mongoose";
import { describe, expect, it, vi } from "vitest";

import { recordAudit, type PulseAuditInput } from "@/lib/pulse/audit";
import PulseAuditEvent from "@/models/PulseAuditEvent";

const id = () => new mongoose.Types.ObjectId();
const input = (): PulseAuditInput => ({
  quizId: id(),
  type: "quiz.created",
  actor: { userId: id(), role: "owner" },
});

describe("recordAudit", () => {
  it("creates one event and forwards the session", async () => {
    const saved = { _id: id() };
    const create = vi
      .spyOn(PulseAuditEvent, "create")
      .mockResolvedValue([saved] as never);
    const session = {} as ClientSession;
    const event = input();

    await expect(recordAudit(event, { session })).resolves.toBe(saved);
    expect(create).toHaveBeenCalledWith([event], { session });
  });

  it("works without a session", async () => {
    const create = vi
      .spyOn(PulseAuditEvent, "create")
      .mockResolvedValue([{}] as never);
    const event = input();
    await recordAudit(event);
    expect(create).toHaveBeenCalledWith([event], { session: undefined });
  });

  it("propagates failures (fail-closed)", async () => {
    vi.spyOn(PulseAuditEvent, "create").mockRejectedValue(new Error("db down"));
    await expect(recordAudit(input())).rejects.toThrow("db down");
  });
});
