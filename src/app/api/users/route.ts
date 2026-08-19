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

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseSearchParams } from "@/lib/api/result";
import {
  optionalSearchQuerySchema,
  paginationQueryFields,
} from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import { canUploadFiles } from "@/lib/access/files";
import dbConnect from "@/lib/mongodb";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import { prepareSearchQuery } from "@/lib/search";
import { getDisplayName } from "@/lib/utils";
import User from "@/models/User";

type MinimalUser = {
  _id: string;
  name: string;
  email: string;
  image: string | null;
};

const toMinimal = (u: any): MinimalUser => ({
  _id: u._id.toString(),
  email: u.email,
  name: getDisplayName(u.name, u.pizza_count),
  image: u.image || null,
});

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return jsonError("UNAUTHENTICATED", "Unauthorized");
  }

  const user = session.user as any;
  if (!canUploadFiles(user.access)) {
    return jsonError("FORBIDDEN", "Forbidden.");
  }

  await dbConnect();

  const { searchParams } = new URL(request.url);
  const query = parseSearchParams(
    searchParams,
    z.object({
      ...paginationQueryFields,
      ids: z
        .string()
        .trim()
        .max(2_500)
        .refine(
          (value) =>
            !value ||
            value
              .split(",")
              .filter(Boolean)
              .every((id) => /^[a-f\d]{24}$/i.test(id.trim())),
          "ids must be a comma-separated list of ObjectIds",
        )
        .optional(),
      search: optionalSearchQuerySchema,
    }),
  );
  if (!query.ok) return jsonResult(query);
  const idsParam = query.data.ids;

  // Resolve specific users by id
  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);

    if (ids.length === 0) return jsonOk({ items: [] });

    const cacheKey = buildCacheKey("users", {
      ids: [...ids].sort().join(","),
      shape: "profile-v2",
    });
    const items = await cachedFetch(cacheKey, CACHE_TTLS.USERS, async () => {
      const users = await User.find({ _id: { $in: ids } })
        .select("_id name email image pizza_count")
        .lean();
      return (users as any[]).map(toMinimal);
    });

    return jsonOk({ items });
  }

  const { page, limit, skip } = parsePagination(searchParams, { limit: 30 });
  const search = prepareSearchQuery(query.data.search);
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
    shape: "profile-v2",
  });

  const result = await cachedFetch(cacheKey, CACHE_TTLS.USERS, async () => {
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("_id name email image pizza_count")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return { data: (users as any[]).map(toMinimal), total };
  });

  return jsonOk(paginatedResponse(result.data, result.total, page, limit));
}
