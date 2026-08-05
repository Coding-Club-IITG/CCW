/**
 * GET /api/users - search/list a minimal set of users
 *
 * Query params:
 *   - search : filter by name or email
 *   - ids    : comma-separated user ids to resolve
 *   - page / limit : offset pagination (default limit 30)
 *
 * Only accessible to users who can upload.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import { canUploadFiles } from "@/lib/fileAccess";
import dbConnect from "@/lib/mongodb";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import { prepareSearchQuery } from "@/lib/search";
import { getDisplayName } from "@/lib/utils";
import User from "@/models/User";

type MinimalUser = { _id: string; name: string; email: string };

const toMinimal = (u: any): MinimalUser => ({
  _id: u._id.toString(),
  email: u.email,
  name: getDisplayName(u.name, u.pizza_count),
});

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  if (!canUploadFiles(user.access)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await dbConnect();

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids")?.trim();

  // Resolve specific users by id
  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);

    if (ids.length === 0) return NextResponse.json({ items: [] });

    const cacheKey = buildCacheKey("users", { ids: [...ids].sort().join(",") });
    const items = await cachedFetch(cacheKey, CACHE_TTLS.USERS, async () => {
      const users = await User.find({ _id: { $in: ids } })
        .select("_id name email pizza_count")
        .lean();
      return (users as any[]).map(toMinimal);
    });

    return NextResponse.json({ items });
  }

  const { page, limit, skip } = parsePagination(searchParams, { limit: 30 });
  const search = prepareSearchQuery(searchParams.get("search"));
  const filter = search
    ? {
        $or: [
          { name: { $regex: search.pattern, $options: "i" } },
          { email: { $regex: search.pattern, $options: "i" } },
        ],
      }
    : {};

  const cacheKey = buildCacheKey("users", {
    page,
    limit,
    search: search?.query,
  });

  const result = await cachedFetch(cacheKey, CACHE_TTLS.USERS, async () => {
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("_id name email pizza_count")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return { data: (users as any[]).map(toMinimal), total };
  });

  return NextResponse.json(
    paginatedResponse(result.data, result.total, page, limit),
  );
}
