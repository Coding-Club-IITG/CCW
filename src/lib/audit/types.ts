import type { AccessLevel, AuditAction, AuditCategory } from "@/lib/constants";

export type AuditSummaryValue = string | number | boolean | null | string[];
export type AuditSummary = Record<string, AuditSummaryValue>;

export type AuditActor = {
  userId: string;
  displayName: string;
  access: AccessLevel;
};

export type AuditEventInput = {
  actor: AuditActor;
  category: AuditCategory;
  action: AuditAction;
  operation: string;
  target: { type: string; id: string; label: string };
  before?: AuditSummary;
  after?: AuditSummary;
  createdAt?: Date;
};

export type AuditLogDto = AuditEventInput & {
  id: string;
  before: AuditSummary;
  after: AuditSummary;
  createdAt: string;
  expiresAt: string;
};
