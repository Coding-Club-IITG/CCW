/**
 * GET  /api/admin/hackathons - List all hackathons (admin only)
 * POST /api/admin/hackathons - Create a new hackathon (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
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
import Hackathon from "@/models/Hackathon";
import User from "@/models/User";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });
    const status = searchParams.get("status");

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

    return NextResponse.json(
      paginatedResponse(result.hackathons, result.total, page, limit),
    );
  } catch (err) {
    console.error("[Hackathon Admin] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

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
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (
      !organization ||
      typeof organization !== "string" ||
      organization.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Organization is required." },
        { status: 400 },
      );
    }

    if (!maxMembers || typeof maxMembers !== "number" || maxMembers < 1) {
      return NextResponse.json(
        { error: "Max members must be at least 1." },
        { status: 400 },
      );
    }

    const resolvedMin =
      minMembers && typeof minMembers === "number" && minMembers >= 1
        ? minMembers
        : 1;

    if (resolvedMin > maxMembers) {
      return NextResponse.json(
        { error: "Min members cannot exceed max members." },
        { status: 400 },
      );
    }

    if (!deadline) {
      return NextResponse.json(
        { error: "Deadline is required." },
        { status: 400 },
      );
    }

    if (
      !websiteUrl ||
      typeof websiteUrl !== "string" ||
      websiteUrl.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Website URL is required." },
        { status: 400 },
      );
    }

    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid deadline date." },
        { status: 400 },
      );
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
      description: (description || "").trim(),
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

    return NextResponse.json({ hackathon }, { status: 201 });
  } catch (err) {
    console.error("[Hackathon Admin] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
