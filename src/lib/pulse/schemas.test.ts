import { describe, expect, it } from "vitest";

import { pulseQuizSchema } from "@/lib/pulse/schemas";

const id = "1234567890abcdef12345678";

describe("Pulse draft schema", () => {
  it("matches the model defaults and normalizes a pending owner", () => {
    const quiz = pulseQuizSchema.parse({
      roomCode: "a7k9p2",
      hostAssignments: [{ email: " Host@IITG.ac.in ", role: "owner", assignedBy: id }],
    });
    expect(quiz).toMatchObject({
      status: "draft", roomCode: "A7K9P2", ownerId: null,
      registration: { allowGuests: false, maxParticipants: 500, allowLateJoin: false },
      hostAssignments: [{ email: "host@iitg.ac.in", role: "owner" }],
    });
    expect(quiz.slides).toEqual([]);
  });

  it("rejects missing owners, duplicate normalized emails, mismatched owner IDs and invalid settings", () => {
    const host = { email: "host@iitg.ac.in", role: "owner", assignedBy: id };
    for (const input of [
      { roomCode: "A7K9P2" },
      { roomCode: "A7K9P2", hostAssignments: [host, { ...host, email: " HOST@iitg.ac.in ", role: "cohost" }] },
      { roomCode: "A7K9P2", ownerId: id, hostAssignments: [{ ...host, userId: "abcdef1234567890abcdef12" }] },
      { roomCode: "A7K9P2", ownerId: id, delivery: { mode: "participant-paced" } },
      { roomCode: "A7K9P2", ownerId: id, registration: { maxParticipants: 0 } },
    ]) expect(pulseQuizSchema.safeParse(input).success).toBe(false);
  });
});
