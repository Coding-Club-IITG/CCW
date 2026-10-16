import mongoose from "mongoose";

import { requirePulseHost } from "@/lib/api/pulse";
import { err, ok, parseJson, zodIssuesToFields, type AppResult } from "@/lib/api/result";
import { isPulseQuizEditable, PULSE_EDITABLE_STATUSES } from "@/lib/pulse/constants";
import {
  normalizeRawSlides,
  pulseDeckSchema,
  readStoredConfig,
  readStoredSlides,
  type PulseDelivery,
  type PulseRegistration,
  type PulseSettings,
  type PulseSlide,
} from "@/lib/pulse/deckSchemas";
import { verifyEditorLock } from "@/lib/pulse/editorLock";
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
const lockLost = () => err("PULSE_EDITOR_LOCKED", "You no longer hold the editor lock.");

export async function getDeck(request: Request, quizId: string): Promise<AppResult<PulseDeckDto>> {
  const authorization = await requirePulseHost(request, quizId);
  if (!authorization.ok) return authorization;
  return ok(deckDto(authorization.data.quiz as DeckSource));
}

/** Saves the whole deck and config: host → editable → lock → validation → fenced write. */
export async function saveDeck(request: Request, quizId: string): Promise<AppResult<PulseDeckDto>> {
  const authorization = await requirePulseHost(request, quizId);
  if (!authorization.ok) return authorization;
  const { role, userId, quiz } = authorization.data;
  if (role === "admin") return err("PULSE_NOT_HOST", "No host assignment for this quiz.");
  const body = await parseJson(request, pulseSaveDeckSchema);
  if (!body.ok) return body;

  if (!isPulseQuizEditable(quiz.status)) return lobbyOpen();
  const { lockToken, deckVersion } = body.data;
  if (!(await verifyEditorLock(quizId, userId, lockToken))) return lockLost();

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

  // The check above can go stale before the write, so the write itself is fenced on the
  // lock token in the durable mirror and on the version the host last saw.
  let saved: DeckSource | null;
  try {
    saved = await PulseQuiz.findOneAndUpdate(
      {
        _id: quizId,
        status: { $in: PULSE_EDITABLE_STATUSES },
        "editorLock.lockedBy": new mongoose.Types.ObjectId(userId),
        "editorLock.token": lockToken,
        ...(deckVersion === 0
          ? { $or: [{ deckVersion: 0 }, { deckVersion: { $exists: false } }] }
          : { deckVersion }),
      },
      {
        $set: { slides: deck.slides, delivery: deck.delivery, registration: deck.registration, settings: deck.settings },
        $inc: { deckVersion: 1 },
      },
      { returnDocument: "after" },
    ).lean<DeckSource>();
  } catch (error) {
    logger.error("Pulse deck save failed", { route: "pulse_deck_save", quizId, ...errorToLogMetadata(error) });
    return err("PULSE_SAVE_FAILED", "The deck could not be saved. Your changes are unchanged; try again.");
  }
  // Success is never reported without a matching write.
  if (saved) return ok(deckDto(saved));

  const current = await PulseQuiz.findById(quizId).select("status editorLock").lean();
  if (!current) return err("PULSE_QUIZ_NOT_FOUND", "Pulse quiz not found.");
  if (!isPulseQuizEditable(current.status)) return lobbyOpen();
  if (current.editorLock?.lockedBy?.toString() !== userId || current.editorLock.token !== lockToken) return lockLost();
  return err("CONFLICT", "This deck was changed elsewhere. Reload the page to continue.");
}
