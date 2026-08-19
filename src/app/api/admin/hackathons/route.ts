/**
 * GET  /api/admin/hackathons - List all hackathons (admin only)
 * POST /api/admin/hackathons - Create a new hackathon (admin only)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseJson, parseSearchParams } from "@/lib/api/result";
import {
  jsonObjectSchema,
  paginationQueryFields,
} from "@/lib/api/schemas/boundary";
import { requireHead } from "@/lib/api/auth";
import dbConnect from "@/lib/mongodb";
import {
  cachedFetch,
  buildCacheKey,
  CACHE_TTLS,
  invalidateCache,
} from "@/lib/cache";
import { notifyMany } from "@/lib/notify";
import { fetchOgImage } from "@/lib/ogImage";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { errorToLogMetadata, logger } from "@/lib/utils";
import Hackathon from "@/models/Hackathon";
import User from "@/models/User";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const user = authorization.data.user;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const query = parseSearchParams(
      searchParams,
      z.object({
        ...paginationQueryFields,
        status: z.enum(["active", "archived"]).optional(),
      }),
    );
    if (!query.ok) return jsonResult(query);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });
    const status = query.data.status;

    const filter: Record<string, any> = {};
    if (status === "active" || status === "archived") {
      filter.status = status;
    }

    const cacheKey = buildCacheKey("admin:hackathons", {
      page,
      limit,
      status: status || undefined,
    });

    const result = await cachedFetch(
      cacheKey,
      CACHE_TTLS.HACKATHONS,
      async () => {
        const [hackathons, total] = await Promise.all([
          Hackathon.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          Hackathon.countDocuments(filter),
        ]);
        return { hackathons, total };
      },
    );

    return jsonOk(
      paginatedResponse(result.hackathons, result.total, page, limit),
    );
  } catch (err) {
    logger.error("Admin hackathon listing failed", {
      route: "GET /api/admin/hackathons",
      operation: "list_hackathons",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const user = authorization.data.user;

    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;

    const {
      name,
      organization,
      minMembers,
      maxMembers,
      skills,
      websiteUrl,
      deadline,
      description,
    } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return jsonError("VALIDATION_ERROR", "Name is required.");
    }

    if (
      !organization ||
      typeof organization !== "string" ||
      organization.trim().length === 0
    ) {
      return jsonError("VALIDATION_ERROR", "Organization is required.");
    }

    if (!maxMembers || typeof maxMembers !== "number" || maxMembers < 1) {
      return jsonError("VALIDATION_ERROR", "Max members must be at least 1.");
    }

    const resolvedMin =
      minMembers && typeof minMembers === "number" && minMembers >= 1
        ? minMembers
        : 1;

    if (resolvedMin > maxMembers) {
      return jsonError(
        "VALIDATION_ERROR",
        "Min members cannot exceed max members.",
      );
    }

    if (!deadline || typeof deadline !== "string") {
      return jsonError("VALIDATION_ERROR", "Deadline is required.");
    }

    if (
      !websiteUrl ||
      typeof websiteUrl !== "string" ||
      websiteUrl.trim().length === 0
    ) {
      return jsonError("VALIDATION_ERROR", "Website URL is required.");
    }

    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return jsonError("VALIDATION_ERROR", "Invalid deadline date.");
    }

    await dbConnect();

    const validSkills: string[] = [];
    if (Array.isArray(skills)) {
      for (const s of skills) {
        if (typeof s === "string" && s.trim().length > 0) {
          validSkills.push(s.trim());
        }
      }
    }

    // Fetch OG image from website URL (non-blocking, best-effort)
    let ogImage = "";
    if (websiteUrl) {
      ogImage = await fetchOgImage(websiteUrl);
    }

    const hackathon = await Hackathon.create({
      name: name.trim(),
      organization: organization.trim(),
      minMembers: resolvedMin,
      maxMembers,
      skills: validSkills,
      websiteUrl: websiteUrl || "",
      ogImage,
      deadline: deadlineDate,
      description: typeof description === "string" ? description.trim() : "",
      status: "active",
      createdBy: user.id,
    });

    // Broadcast notification to all members
    await invalidateCache("hackathons");
    await invalidateCache("admin:hackathons");

    const allUsers = await User.find({}).select("_id").lean();
    const userIds = (allUsers as any[]).map((u) => u._id.toString());
    await notifyMany(userIds, {
      type: "team_invite",
      title: "New Hackathon Added",
      message: `"${name.trim()}" by ${organization.trim()} is now open for team formation!`,
      link: `/internal/hackathons/${hackathon._id}`,
    });

    return jsonOk({ hackathon }, { status: 201 });
  } catch (err) {
    logger.error("Admin hackathon creation failed", {
      route: "POST /api/admin/hackathons",
      operation: "create_hackathon",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
