/**
 * Shared admin auth helper for API routes
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isHead } from "@/lib/roles";

export async function requireAdmin(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const user = session.user;
  if (!isHead(user.access)) return null;
  return user;
}
