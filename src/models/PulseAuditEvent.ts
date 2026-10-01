import mongoose from "mongoose";

import {
  AUDIT_SUMMARY_MAX_ARRAY,
  AUDIT_SUMMARY_MAX_KEYS,
  AUDIT_SUMMARY_MAX_STRING,
} from "@/lib/audit/summary";
import {
  PULSE_AUDIT_ACTOR_ROLES,
  PULSE_AUDIT_EVENT_TYPES,
  PULSE_AUDIT_FORBIDDEN_METADATA_KEY,
} from "@/lib/pulse/constants";

const { Schema } = mongoose;

// Flat, bounded metadata with no secret-looking keys.
export function validMetadata(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > AUDIT_SUMMARY_MAX_KEYS) return false;
  const str = (v: unknown) =>
    typeof v === "string" && v.length <= AUDIT_SUMMARY_MAX_STRING;
  return entries.every(([key, v]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/.test(key)) return false;
    if (PULSE_AUDIT_FORBIDDEN_METADATA_KEY.test(key)) return false;
    if (Array.isArray(v))
      return v.length <= AUDIT_SUMMARY_MAX_ARRAY && v.every(str);
    return (
      str(v) ||
      v === null ||
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v))
    );
  });
}

const ActorSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: PULSE_AUDIT_ACTOR_ROLES, required: true },
  },
  { _id: false },
);

const TargetSchema = new Schema(
  {
    type: { type: String, required: true, maxlength: 64 },
    id: { type: String, required: true, maxlength: 128 },
  },
  { _id: false },
);

const PulseAuditEventSchema = new Schema(
  {
    quizId: {
      type: Schema.Types.ObjectId,
      ref: "PulseQuiz",
      required: true,
      immutable: true,
    },
    type: {
      type: String,
      enum: PULSE_AUDIT_EVENT_TYPES,
      required: true,
      immutable: true,
    },
    actor: { type: ActorSchema, required: true, immutable: true },
    target: { type: TargetSchema, immutable: true },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
      validate: validMetadata,
      immutable: true,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
  },
  { versionKey: false, strict: "throw", minimize: false },
);

PulseAuditEventSchema.index({ quizId: 1, createdAt: 1 });

export type PulseAuditEventRecord = mongoose.InferSchemaType<
  typeof PulseAuditEventSchema
>;

const PulseAuditEvent =
  (mongoose.models.PulseAuditEvent as
    mongoose.Model<PulseAuditEventRecord> | undefined) ||
  mongoose.model<PulseAuditEventRecord>(
    "PulseAuditEvent",
    PulseAuditEventSchema,
    "pulse_audit_events",
  );

export default PulseAuditEvent;
