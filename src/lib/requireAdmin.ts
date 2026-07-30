/**
 * Shared admin auth helper for API routes
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";

export async function requireAdmin(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const user = session.user;
  if (!isAdmin(user.role)) return null;
  return user;
}
