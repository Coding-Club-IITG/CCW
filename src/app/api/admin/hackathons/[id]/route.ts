/**
 * PATCH  /api/admin/hackathons/[id] - Update a hackathon (admin only)
 * DELETE /api/admin/hackathons/[id] - Archive a hackathon (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { HACKATHON_STATUSES, type HackathonStatus } from "@/lib/constants";
import { logger } from "@/lib/utils";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import { invalidateCache } from "@/lib/cache";
import Hackathon from "@/models/Hackathon";

type HackathonUpdate = {
  name?: string;
  organization?: string;
  minMembers?: number;
  maxMembers?: number;
  skills?: string[];
  websiteUrl?: string;
  deadline?: Date;
  description?: string;
  status?: HackathonStatus;
};

function parseHackathonUpdate(
  body: unknown,
): { update: HackathonUpdate } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be an object." };
  }

  const input = body as Record<string, unknown>;
  const update: HackathonUpdate = {};

  for (const field of ["name", "organization", "websiteUrl"] as const) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== "string" || !input[field].trim()) {
      return { error: `${field} must be a non-empty string.` };
    }
    update[field] = input[field].trim();
  }

  if (input.description !== undefined) {
    if (typeof input.description !== "string") {
      return { error: "description must be a string." };
    }
    update.description = input.description.trim();
  }

  for (const field of ["minMembers", "maxMembers"] as const) {
    if (input[field] === undefined) continue;
    if (!Number.isInteger(input[field]) || Number(input[field]) < 1) {
      return { error: `${field} must be a positive integer.` };
    }
    update[field] = Number(input[field]);
  }

  if (input.skills !== undefined) {
    if (
      !Array.isArray(input.skills) ||
      input.skills.some((skill) => typeof skill !== "string")
    ) {
      return { error: "skills must be an array of strings." };
    }
    update.skills = input.skills.map((skill) => skill.trim()).filter(Boolean);
  }

  if (input.deadline !== undefined) {
    if (typeof input.deadline !== "string") {
      return { error: "deadline must be a valid date." };
    }
    const deadline = new Date(input.deadline);
    if (Number.isNaN(deadline.getTime())) {
      return { error: "deadline must be a valid date." };
    }
    update.deadline = deadline;
  }

  if (input.status !== undefined) {
    if (
      typeof input.status !== "string" ||
      !HACKATHON_STATUSES.includes(input.status as HackathonStatus)
    ) {
      return { error: "status is invalid." };
    }
    update.status = input.status as HackathonStatus;
  }

  if (Object.keys(update).length === 0) {
    return { error: "No valid fields were provided." };
  }

  return { update };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const parsed = parseHackathonUpdate(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await dbConnect();
    const existing = await Hackathon.findById(id)
      .select("minMembers maxMembers")
      .lean<{ minMembers: number; maxMembers: number }>();
    if (!existing) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const minMembers = parsed.update.minMembers ?? existing.minMembers;
    const maxMembers = parsed.update.maxMembers ?? existing.maxMembers;
    if (minMembers > maxMembers) {
      return NextResponse.json(
        { error: "Min members cannot exceed max members." },
        { status: 400 },
      );
    }

    const hackathon = await Hackathon.findByIdAndUpdate(id, parsed.update, {
      new: true,
      runValidators: true,
    }).lean();
    if (!hackathon) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    await invalidateCache("hackathons");
    await invalidateCache("admin:hackathons");

    return NextResponse.json({ hackathon });
  } catch (err) {
    logger.error("[Hackathon Admin] PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await dbConnect();

    // Soft archive instead of hard delete
    const hackathon = await Hackathon.findByIdAndUpdate(
      id,
      { status: "archived" },
      { new: true, runValidators: true },
    ).lean();

    if (!hackathon) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    await invalidateCache("hackathons");
    await invalidateCache("admin:hackathons");

    return NextResponse.json({ hackathon });
  } catch (err) {
    logger.error("[Hackathon Admin] DELETE error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
