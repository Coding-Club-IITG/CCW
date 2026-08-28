import mongoose from "mongoose";

import {
  ACCESS_LEVELS,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
} from "@/lib/constants";
import {
  AUDIT_SUMMARY_MAX_ARRAY,
  AUDIT_SUMMARY_MAX_KEYS,
  AUDIT_SUMMARY_MAX_STRING,
} from "@/lib/audit/summary";

export function auditExpiry(createdAt: Date): Date {
  const day = createdAt.getUTCDate();
  const expiresAt = new Date(createdAt);
  expiresAt.setUTCDate(1);
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 6);
  const lastDay = new Date(
    Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth() + 1, 0),
  ).getUTCDate();
  expiresAt.setUTCDate(Math.min(day, lastDay));
  return expiresAt;
}

function validSummary(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > AUDIT_SUMMARY_MAX_KEYS) return false;
  return entries.every(([key, item]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/.test(key)) return false;
    if (typeof item === "string")
      return item.length <= AUDIT_SUMMARY_MAX_STRING;
    if (Array.isArray(item))
      return (
        item.length <= AUDIT_SUMMARY_MAX_ARRAY &&
        item.every(
          (entry) =>
            typeof entry === "string" &&
            entry.length <= AUDIT_SUMMARY_MAX_STRING,
        )
      );
    return (
      item === null ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    );
  });
}

const Summary = {
  type: mongoose.Schema.Types.Mixed,
  default: {},
  validate: validSummary,
};
const ActorSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, maxlength: 128 },
    displayName: { type: String, required: true, maxlength: 160 },
    access: { type: String, enum: ACCESS_LEVELS, required: true },
  },
  { _id: false },
);
const TargetSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, maxlength: 64 },
    id: { type: String, required: true, maxlength: 128 },
    label: { type: String, required: true, maxlength: 160 },
  },
  { _id: false },
);
const AuditLogSchema = new mongoose.Schema(
  {
    actor: { type: ActorSchema, required: true, immutable: true },
    category: {
      type: String,
      enum: AUDIT_CATEGORIES,
      required: true,
      immutable: true,
    },
    action: {
      type: String,
      enum: AUDIT_ACTIONS,
      required: true,
      immutable: true,
    },
    operation: { type: String, required: true, maxlength: 96, immutable: true },
    target: { type: TargetSchema, required: true, immutable: true },
    before: { ...Summary, immutable: true },
    after: { ...Summary, immutable: true },
    createdAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
  },
  { versionKey: false, strict: "throw", minimize: false },
);

AuditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
AuditLogSchema.index({ createdAt: -1, _id: -1 });
AuditLogSchema.index({ "actor.userId": 1, createdAt: -1 });
AuditLogSchema.index({ category: 1, operation: 1, createdAt: -1 });
AuditLogSchema.index({ "target.type": 1, "target.id": 1, createdAt: -1 });

export type AuditLogRecord = mongoose.InferSchemaType<typeof AuditLogSchema>;
const AuditLog =
  (mongoose.models.AuditLog as mongoose.Model<AuditLogRecord> | undefined) ||
  mongoose.model<AuditLogRecord>("AuditLog", AuditLogSchema);
export default AuditLog;
