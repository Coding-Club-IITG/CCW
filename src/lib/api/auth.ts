import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isHead } from "@/lib/access/roles";
import { err, ok, type AppResult } from "@/lib/api/result";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
type AuthenticatedSession = NonNullable<Session>;

export async function requireSession(
  request: Request | NextRequest,
): Promise<AppResult<AuthenticatedSession>> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session
    ? ok(session)
    : err("UNAUTHENTICATED", "Authentication required.");
}

export async function requireHead(
  request: Request | NextRequest,
): Promise<AppResult<AuthenticatedSession>> {
  const session = await requireSession(request);
  if (!session.ok) return session;
  return isHead(session.data.user.access)
    ? session
    : err("FORBIDDEN", "You do not have permission to perform this action.");
}
