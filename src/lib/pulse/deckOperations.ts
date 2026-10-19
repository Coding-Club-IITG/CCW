import { z } from "zod";

import { requirePulseHost } from "@/lib/api/pulse";
import { err, parseJson, validationError, zodIssuesToFields, type AppResult } from "@/lib/api/result";
import { dbConnect } from "@/lib/mongodb";
import { isPulseQuizEditable } from "@/lib/pulse/constants";
import { addSlide, deleteSlide, duplicateSlide } from "@/lib/pulse/deck";
import {
  hasUnsupportedSlides,
  pulseInfoSlideSchema,
  pulseMcqSlideSchema,
  pulseSlideSchema,
  readStoredConfig,
  readStoredSlides,
} from "@/lib/pulse/deckSchemas";
import { saveDeck, type PulseDeckDto } from "@/lib/pulse/deckService";
import { pulseLockTokenSchema } from "@/lib/pulse/schemas";

const slideId = z.string().min(1, "Slide ID is required.");
const newSlideSchema = z.discriminatedUnion("type", [
  pulseInfoSlideSchema.omit({ slideId: true, order: true }),
  pulseMcqSlideSchema.omit({ slideId: true, order: true }),
]);

export const pulseDeckOperationsSchema = z.strictObject({
  lockToken: pulseLockTokenSchema.shape.lockToken,
  deckVersion: z.number().int().min(0),
  operations: z.array(z.discriminatedUnion("operation", [
    z.strictObject({ operation: z.literal("create"), slide: newSlideSchema, atIndex: z.number().int().min(0).optional() }),
    // Validate replacement content against the saved slide's type below, never a client role/type claim.
    z.strictObject({ operation: z.literal("update"), slideId, content: z.unknown() }),
    z.strictObject({ operation: z.literal("delete"), slideId }),
    z.strictObject({ operation: z.literal("duplicate"), slideId }),
  ])).min(1, "Provide at least one slide operation."),
});

/** Explicit save command, not an autosave API. No write occurs until all operations validate. */
export async function saveDeckOperations(request: Request, quizId: string): Promise<AppResult<PulseDeckDto>> {
  await dbConnect();
  const authorization = await requirePulseHost(request, quizId);
  if (!authorization.ok) return authorization;
  const { quiz, userId } = authorization.data;
  // Parse only the credential first; operation validation must not hide a lost lock.
  const envelope = await parseJson(request, pulseLockTokenSchema.loose());
  if (!envelope.ok) return envelope;
  if (!isPulseQuizEditable(quiz.status)) return err("CONFLICT", "This quiz can no longer be edited.");
  const held = quiz.editorLock;
  if (held?.lockedBy?.toString() !== userId || held.token !== envelope.data.lockToken || !held.expiresAt || held.expiresAt <= new Date())
    return err("CONFLICT", "You no longer hold the editor lock.", { fields: { editorLock: ["You no longer hold the editor lock."] } });
  const body = pulseDeckOperationsSchema.safeParse(envelope.data);
  if (!body.success) return validationError(body.error);
  if (body.data.deckVersion !== (quiz.deckVersion ?? 0))
    return err("CONFLICT", "This deck was changed elsewhere. Reload the latest version to continue.");
  if (hasUnsupportedSlides(quiz.slides))
    return err("CONFLICT", "This quiz has slides of a type the editor doesn't support, so it can't be opened here.");

  const config = readStoredConfig(quiz);
  let slides = readStoredSlides(quiz.slides);
  let settings = config.settings;
  // IDs survive insertions/deletions; array positions do not. Track the last content producer.
  const sources = new Map<string, { index: number; operation: "create" | "update" | "duplicate" }>();
  for (const [index, operation] of body.data.operations.entries()) {
    if (operation.operation === "update") {
      const target = slides.find((slide) => slide.slideId === operation.slideId);
      if (!target) return err("NOT_FOUND", "That slide no longer exists.", { fields: { [`operations.${index}.slideId`]: ["Reload the deck and choose an existing slide."] } });
      const parsed = pulseSlideSchema.safeParse({ ...target, content: operation.content });
      if (!parsed.success) {
        return err("VALIDATION_ERROR", "The slide content is invalid.", {
          fields: zodIssuesToFields(parsed.error.issues.map((issue) => ({ ...issue, path: ["operations", index, ...issue.path] }))),
        });
      }
      slides = slides.map((slide) => slide.slideId === target.slideId ? parsed.data : slide);
      sources.set(target.slideId, { index, operation: "update" });
      continue;
    }

    const result = operation.operation === "create"
      ? addSlide(slides, operation.slide.type, operation.atIndex)
      : operation.operation === "delete"
        ? deleteSlide(slides, operation.slideId)
        : duplicateSlide(slides, operation.slideId);
    if (!result.ok) {
      return err(result.error.code === "SLIDE_NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_ERROR", result.error.message, {
        fields: { [`operations.${index}.${operation.operation === "create" ? "atIndex" : "slideId"}`]: [result.error.message] },
      });
    }
    slides = result.slides;
    if (operation.operation === "create") {
      const position = operation.atIndex ?? slides.length - 1;
      // The helper generates the ID/order; the request supplies only validated type-specific content.
      const created = pulseSlideSchema.parse({ ...slides[position], ...operation.slide });
      slides = slides.map((slide, i) => i === position ? created : slide);
      sources.set(created.slideId, { index, operation: "create" });
    }
    if (operation.operation === "duplicate" && "slide" in result) {
      sources.set(result.slide.slideId, { index, operation: "duplicate" });
    }
    if (operation.operation === "delete") {
      settings = {
        ...settings,
        leaderboard: {
          ...settings.leaderboard,
          showAfterQuestions: settings.leaderboard.showAfterQuestions.filter((id) => id !== operation.slideId),
        },
      };
    }
  }

  // Reauthorize and use the existing atomic lock/status/version fence and transactional audit.
  // Concurrent whole-deck saves and operation saves share the same deckVersion.
  const saved = await saveDeck(new Request(request, {
    body: JSON.stringify({
      lockToken: body.data.lockToken,
      deckVersion: body.data.deckVersion,
      slides,
      delivery: config.delivery,
      registration: config.registration,
      settings,
    }),
  }), quizId);
  if (saved.ok || saved.error.code !== "VALIDATION_ERROR" || !saved.error.fields) return saved;
  const fields: Record<string, string[]> = {};
  for (const [path, messages] of Object.entries(saved.error.fields)) {
    const match = /^slides\.(\d+)(\..*)?$/.exec(path);
    const slide = match ? slides[Number(match[1])] : undefined;
    const source = slide ? sources.get(slide.slideId) : undefined;
    let mapped = path;
    if (match && source) {
      const suffix = source.operation === "duplicate" ? ".slideId"
        : `${source.operation === "create" ? ".slide" : ""}${match[2] ?? ""}`;
      mapped = `operations.${source.index}${suffix}`;
    }
    (fields[mapped] ??= []).push(...messages);
  }
  return { ...saved, error: { ...saved.error, fields } };
}
