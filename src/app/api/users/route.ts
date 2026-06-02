/**
 * GET /api/users - returns a minimal list of users
 *
 * Only accessible to users who can upload.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import { canUploadFiles } from "@/lib/fileAccess";
import dbConnect from "@/lib/mongodb";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import { getDisplayName } from "@/lib/utils";
import User from "@/models/User";

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

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams, { limit: 30 });

  const cacheKey = buildCacheKey("users", { page, limit });

  const result = await cachedFetch(cacheKey, CACHE_TTLS.USERS, async () => {
    const [users, total] = await Promise.all([
      User.find({})
        .select("_id name email pizza_count")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments({}),
    ]);

    const data = users.map((u: any) => ({
      ...u,
      name: getDisplayName(u.name, u.pizza_count),
    }));

    return { data, total };
  });

  return NextResponse.json(
    paginatedResponse(result.data, result.total, page, limit),
  );
}
