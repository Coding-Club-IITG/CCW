import type { ClientSession, Types } from "mongoose";

import type {
  PulseAuditActorRole,
  PulseAuditEventType,
} from "@/lib/pulse/constants";
import PulseAuditEvent from "@/models/PulseAuditEvent";

export type PulseAuditInput = {
  quizId: Types.ObjectId | string;
  type: PulseAuditEventType;
  actor: { userId: Types.ObjectId | string; role: PulseAuditActorRole };
  target?: { type: string; id: string };
  metadata?: Record<string, unknown>;
  createdAt?: Date;
};

/**
 * Persists one Pulse audit event. Goes through `create`, so enum checks, the
 * metadata validator (bounded, no secret-looking keys) and ObjectId casts all
 * run. Throws on invalid input. Pass `session` to join a transaction.
 */
export async function recordAudit(
  input: PulseAuditInput,
  options: { session?: ClientSession } = {},
) {
  const [event] = await PulseAuditEvent.create([input], {
    session: options.session,
  });
  return event;
}
