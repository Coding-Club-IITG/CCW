/**
 * GET /api/hackathons/users?q=search - Search members for team invites
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
import dbConnect from "@/lib/mongodb";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import { prepareSearchQuery } from "@/lib/search";
import { errorToLogMetadata, logger } from "@/lib/utils";
import User from "@/models/User";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const { searchParams } = new URL(request.url);
    const query = parseSearchParams(
      searchParams,
      z.object({
        ...paginationQueryFields,
        q: optionalSearchQuerySchema,
      }),
    );
    if (!query.ok) return jsonResult(query);
    const search = prepareSearchQuery(query.data.q, {
      minLength: 2,
    });

    if (!search) {
      return jsonOk(paginatedResponse([], 0, 1, 20));
    }

    await dbConnect();

    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });
    const filter = {
      name: { $regex: search.pattern, $options: "i" },
    };

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("_id name email pizza_count")
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const data = (users as any[]).map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      pizza_count: u.pizza_count,
    }));

    return jsonOk(paginatedResponse(data, total, page, limit));
  } catch (err) {
    logger.error("Hackathon user search failed", {
      route: "GET /api/hackathons/users",
      operation: "search_users",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
