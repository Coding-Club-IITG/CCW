import type { ClientSession } from "mongoose";

import type { AuditActor, AuditEventInput } from "@/lib/audit/types";
import { ACCESS_LEVELS, type AccessLevel } from "@/lib/constants";
import AuditLog, { auditExpiry } from "@/models/AuditLog";

export async function insertAuditEvent(
  input: AuditEventInput,
  session: ClientSession,
) {
  const createdAt = input.createdAt ?? new Date();
  const [event] = await AuditLog.create(
    [
      {
        ...input,
        before: input.before ?? {},
        after: input.after ?? {},
        createdAt,
        expiresAt: auditExpiry(createdAt),
      },
    ],
    { session },
  );
  return event;
}

export async function auditedTransaction<T>(
  session: ClientSession,
  mutation: (
    session: ClientSession,
  ) => Promise<{ result: T; audit: AuditEventInput }>,
): Promise<T> {
  let output: T | undefined;
  await session.withTransaction(async () => {
    const { result, audit } = await mutation(session);
    await insertAuditEvent(audit, session);
    output = result;
  });
  return output as T;
}

export function auditActor(user: {
  id: string;
  name?: string | null;
  access?: string | null;
}): AuditActor {
  return {
    userId: user.id,
    displayName: (user.name?.trim() || "Unknown member").slice(0, 160),
    access: ACCESS_LEVELS.includes(user.access as AccessLevel)
      ? (user.access as AccessLevel)
      : "Member",
  };
}
