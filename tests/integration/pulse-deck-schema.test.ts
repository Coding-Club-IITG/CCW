import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { defaultPulseConfig, pulseDeckSchema, readStoredSlides } from "@/lib/pulse/deckSchemas";
import PulseQuiz from "@/models/PulseQuiz";

import { clearTestMongo, startTestMongo, stopTestMongo } from "../utils/mongodb";

const id = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startTestMongo();
  await PulseQuiz.init();
});
afterEach(clearTestMongo);
afterAll(stopTestMongo);

describe("PulseQuiz deck persistence", () => {
  it("loads a Phase 1 document with no scoring settings", async () => {
    // Raw insert reproduces what Phase 1 wrote, bypassing the new schema defaults.
    const _id = id();
    await mongoose.connection.collection("pulse_quizzes").insertOne({
      _id, title: "Old", status: "draft", roomCode: "A7K9P2", ownerId: id(), coHostIds: [], hostAssignments: [],
      delivery: { mode: "host-paced", navigation: "sequential", displayMode: "full-prompt" },
      settings: { timer: { overallEnabled: true, overallDurationSeconds: 3600, perQuestionEnabled: true } },
      slides: [
        { slideId: "s1", order: 0, type: "info", content: {} },
        { slideId: "s2", order: 1, type: "mcq", content: { text: "2+2?", options: ["3", "4"], correctOptions: [1], multipleAnswers: false, poll: false, points: 100 } },
      ],
      createdAt: new Date(), updatedAt: new Date(),
    });

    const quiz = await PulseQuiz.findById(_id).lean();
    expect(quiz?.slides).toHaveLength(2);
    expect(readStoredSlides(quiz?.slides)[1]).toMatchObject({ type: "mcq", content: { text: "2+2?", correctOptions: [1], points: 100 } });
    // The stored config merges with defaults for anything Phase 1 did not write.
    const settings = pulseDeckSchema.shape.settings.parse(quiz?.settings);
    expect(settings).toMatchObject({ timer: { overallEnabled: true }, leaderboard: { enabled: true }, randomization: { enabled: false } });
    await expect(PulseQuiz.findById(_id)).resolves.toMatchObject({ title: "Old" });
  });

  it("persists a typed deck and retrieves it unchanged", async () => {
    const config = defaultPulseConfig();
    const slides = [
      { slideId: "s1", order: 0, type: "info" as const, content: { markdown: "# Hi" } },
      { slideId: "s2", order: 1, type: "mcq" as const, content: { text: "Q?", options: ["A", "B"], correctOptions: [0], multipleAnswers: false, poll: false, points: 50, timerSeconds: 30 } },
    ];
    expect(pulseDeckSchema.safeParse({ slides, ...config }).success).toBe(true);
    const quiz = await PulseQuiz.create({ ownerId: id(), roomCode: "B8M3Q4", slides, ...config });
    const found = await PulseQuiz.findById(quiz._id).lean();
    expect(found?.deckVersion).toBe(0);
    expect(readStoredSlides(found?.slides)).toEqual(slides);
  });
});
