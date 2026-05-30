/**
 * GET /api/users - returns a minimal list of users
 *
 * Only accessible to users who can upload.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { canUploadFiles } from "@/lib/fileAccess";
import { parseModuleRoles } from "@/lib/roles";
import { getDisplayName } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (!canUploadFiles(user.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await dbConnect();
  const users = await User.find({})
    .select("_id name email pizza_count")
    .sort({ name: 1 })
    .lean();

  const usersWithDisplay = users.map((u: any) => ({
    ...u,
    name: getDisplayName(u.name, u.pizza_count),
  }));

  return NextResponse.json({ users: usersWithDisplay });
}
