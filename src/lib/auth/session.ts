import type { NextRequest } from "next/server";

import { auth, type AuthSession } from "@/lib/auth/server";
import { isHead, isElevated } from "@/lib/access/roles";
import { err, ok, type AppResult } from "@/lib/api/result";

export async function requireSession(
  request: Request | NextRequest,
): Promise<AppResult<AuthSession>> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session
    ? ok(session)
    : err("UNAUTHENTICATED", "Authentication required.");
}

export async function requireHead(
  request: Request | NextRequest,
): Promise<AppResult<AuthSession>> {
  const session = await requireSession(request);
  if (!session.ok) return session;
  return isHead(session.data.user.access)
    ? session
    : err("FORBIDDEN", "You do not have permission to perform this action.");
}

export async function requireElevated(
  request: Request | NextRequest,
): Promise<AppResult<AuthSession>> {
  const session = await requireSession(request);
  if (!session.ok) return session;
  return isElevated(session.data.user.access)
    ? session
    : err("FORBIDDEN", "You do not have permission to perform this action.");
}
