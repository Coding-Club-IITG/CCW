import mongoose from "mongoose";

import { requirePulseHost } from "@/lib/api/pulse";
import { err, ok, parseJson, zodIssuesToFields, type AppResult } from "@/lib/api/result";
import { dbConnect } from "@/lib/mongodb";
import { isPulseQuizEditable, PULSE_EDITABLE_STATUSES, PULSE_SLIDE_TYPES } from "@/lib/pulse/constants";
import {
  hasUnsupportedSlides,
  normalizeRawSlides,
  pulseDeckSchema,
  readStoredConfig,
  readStoredSlides,
  type PulseDelivery,
  type PulseRegistration,
  type PulseSettings,
  type PulseSlide,
} from "@/lib/pulse/deckSchemas";
import { recordAudit } from "@/lib/pulse/audit";
import { pulseSaveDeckSchema } from "@/lib/pulse/schemas";
import { errorToLogMetadata, logger } from "@/lib/utils";
import PulseQuiz, { type PulseQuizRecord } from "@/models/PulseQuiz";

export type PulseDeckDto = {
  /** True while the quiz is draft or scheduled (the lobby has not opened). */
  editable: boolean;
  /** Incremented by every save; a save only succeeds against the version the host loaded. */
  deckVersion: number;
  slides: PulseSlide[];
  delivery: PulseDelivery;
  registration: PulseRegistration;
  settings: PulseSettings;
};

type DeckSource = Pick<PulseQuizRecord, "status" | "slides" | "delivery" | "registration" | "settings"> & {
  deckVersion?: number | null;
};

// Parses stored data through the shared schemas so Phase 1 documents get defaults.
function deckDto(quiz: DeckSource): PulseDeckDto {
  return {
    editable: isPulseQuizEditable(quiz.status),
    deckVersion: quiz.deckVersion ?? 0,
    slides: readStoredSlides(quiz.slides),
    ...readStoredConfig(quiz),
  };
}

const lobbyOpen = () => err("CONFLICT", "The lobby has opened; this quiz can no longer be edited.");
const unsupportedSlides = () => err("CONFLICT", "This quiz has slides of a type the editor doesn't support, so it can't be opened here.");
// `fields.editorLock` lets the editor tell a lost lock from a stale deck.
const lockLost = () => err("CONFLICT", "You no longer hold the editor lock.", { fields: { editorLock: ["You no longer hold the editor lock."] } });
const deckChanged = () => err("CONFLICT", "This deck was changed elsewhere. Reload the latest version to continue.");

/** Thrown inside the save transaction when the fenced write matched nothing; aborts it. */
class SaveNotMatched extends Error {}

export async function getDeck(request: Request, quizId: string): Promise<AppResult<PulseDeckDto>> {
  await dbConnect();
  const authorization = await requirePulseHost(request, quizId);
  if (!authorization.ok) return authorization;
  const { quiz } = authorization.data;
  // An unsupported (e.g. Q&A) slide is never coerced into another type, so it can't be rewritten by a save.
  if (hasUnsupportedSlides(quiz.slides)) return unsupportedSlides();
  return ok(deckDto(quiz as DeckSource));
}

/** Saves the whole deck and config: host → editable → lock → validation → fenced write + audit. */
export async function saveDeck(request: Request, quizId: string): Promise<AppResult<PulseDeckDto>> {
  await dbConnect();
  const authorization = await requirePulseHost(request, quizId);
  if (!authorization.ok) return authorization;
  const { role, userId, quiz } = authorization.data;
  if (role === "admin") return err("PULSE_NOT_HOST", "No host assignment for this quiz.");
  const body = await parseJson(request, pulseSaveDeckSchema);
  if (!body.ok) return body;

  if (!isPulseQuizEditable(quiz.status)) return lobbyOpen();
  const { lockToken, deckVersion } = body.data;
  // Early, non-authoritative check; the fenced write below is what decides.
  const held = quiz.editorLock;
  if (held?.lockedBy?.toString() !== userId || held.token !== lockToken || !held.expiresAt || held.expiresAt <= new Date()) return lockLost();

  const parsed = pulseDeckSchema.safeParse({
    slides: normalizeRawSlides(body.data.slides),
    delivery: body.data.delivery,
    registration: body.data.registration,
    settings: body.data.settings,
  });
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "The deck has problems that must be fixed before saving.", {
      fields: zodIssuesToFields(parsed.error.issues),
    });
  }
  const deck = parsed.data;

  try {
    let saved!: DeckSource;
    // The deck write and its `deck.saved` audit commit together; if either fails nothing is saved.
    await mongoose.connection.transaction(async (session) => {
      const updated = await PulseQuiz.findOneAndUpdate(
        {
          _id: quizId,
          status: { $in: PULSE_EDITABLE_STATUSES },
          "editorLock.lockedBy": new mongoose.Types.ObjectId(userId),
          "editorLock.token": lockToken,
          "editorLock.expiresAt": { $gt: new Date() },
          // Never overwrite a deck holding slide types the editor can't represent.
          slides: { $not: { $elemMatch: { type: { $nin: PULSE_SLIDE_TYPES } } } },
          ...(deckVersion === 0
            ? { $or: [{ deckVersion: 0 }, { deckVersion: { $exists: false } }] }
            : { deckVersion }),
        },
        {
          $set: { slides: deck.slides, delivery: deck.delivery, registration: deck.registration, settings: deck.settings },
          $inc: { deckVersion: 1 },
        },
        { returnDocument: "after", session },
      ).lean<DeckSource>();
      if (!updated) throw new SaveNotMatched();
      await recordAudit({
        quizId, type: "deck.saved", actor: { userId, role },
        metadata: { deckVersion: updated.deckVersion ?? 0, slideCount: deck.slides.length },
      }, { session });
      saved = updated;
    });
    return ok(deckDto(saved));
  } catch (error) {
    if (!(error instanceof SaveNotMatched)) {
      logger.error("Pulse deck save failed", { route: "pulse_deck_save", quizId, ...errorToLogMetadata(error) });
      return err("SERVICE_UNAVAILABLE", "The deck could not be saved. Your changes are unchanged; try again.");
    }
  }

  // Nothing was written. Re-read to say why; success is never reported without a matching write.
  try {
    const current = await PulseQuiz.findById(quizId).select("status editorLock slides").lean();
    if (!current) return err("PULSE_QUIZ_NOT_FOUND", "Pulse quiz not found.");
    if (!isPulseQuizEditable(current.status)) return lobbyOpen();
    if (hasUnsupportedSlides(current.slides)) return unsupportedSlides();
    const lock = current.editorLock;
    if (lock?.lockedBy?.toString() !== userId || lock.token !== lockToken || !lock.expiresAt || lock.expiresAt <= new Date()) return lockLost();
    return deckChanged();
  } catch (error) {
    logger.error("Pulse deck save re-read failed", { route: "pulse_deck_save", quizId, ...errorToLogMetadata(error) });
    return err("SERVICE_UNAVAILABLE", "The deck could not be saved. Your changes are unchanged; try again.");
  }
}
