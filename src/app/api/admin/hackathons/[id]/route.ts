/**
 * PATCH  /api/admin/hackathons/[id] - Update a hackathon (admin only)
 * DELETE /api/admin/hackathons/[id] - Archive a hackathon (admin only)
 */

import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeHackathon } from "@/lib/audit/summary";
import { requireHead } from "@/lib/api/auth";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  jsonObjectSchema,
  objectIdParamsSchema,
} from "@/lib/api/schemas/boundary";
import { invalidateCache } from "@/lib/cache";
import { HACKATHON_STATUSES, type HackathonStatus } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
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
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);

    const validatedParams = parseRouteParams(
      await params,
      objectIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;

    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;

    const parsed = parseHackathonUpdate(body);
    if ("error" in parsed) {
      return jsonError("VALIDATION_ERROR", parsed.error);
    }

    await dbConnect();
    const existing = await Hackathon.findById(id)
      .select("minMembers maxMembers")
      .lean<{ minMembers: number; maxMembers: number }>();
    if (!existing) {
      return jsonError("NOT_FOUND", "Not found.");
    }
    const minMembers = parsed.update.minMembers ?? existing.minMembers;
    const maxMembers = parsed.update.maxMembers ?? existing.maxMembers;
    if (minMembers > maxMembers) {
      return jsonError(
        "VALIDATION_ERROR",
        "Min members cannot exceed max members.",
      );
    }

    const dbSession = await mongoose.startSession();
    let hackathon;
    try {
      hackathon = await auditedTransaction(dbSession, async (transaction) => {
        const before = await Hackathon.findById(id).session(transaction).lean();
        if (!before) throw new Error("Hackathon disappeared during update.");
        const updated = await Hackathon.findByIdAndUpdate(id, parsed.update, {
          returnDocument: "after",
          runValidators: true,
          session: transaction,
        }).lean();
        if (!updated) throw new Error("Hackathon disappeared during update.");
        return {
          result: updated,
          audit: {
            actor: auditActor(authorization.data.user),
            category: "hackathons" as const,
            action: "update" as const,
            operation: "hackathons.update",
            target: { type: "hackathon", id, label: updated.name },
            before: summarizeHackathon(
              before as unknown as Record<string, unknown>,
            ),
            after: summarizeHackathon(
              updated as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    if (!hackathon) {
      return jsonError("NOT_FOUND", "Not found.");
    }

    await invalidateCache("hackathons");
    await invalidateCache("admin:hackathons");

    return jsonOk({ hackathon });
  } catch (err) {
    logger.error("[Hackathon Admin] PATCH error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);

    const validatedParams = parseRouteParams(
      await params,
      objectIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;
    await dbConnect();
    if (!(await Hackathon.exists({ _id: id })))
      return jsonError("NOT_FOUND", "Not found.");

    // Soft archive instead of hard delete
    const dbSession = await mongoose.startSession();
    let hackathon;
    try {
      hackathon = await auditedTransaction(dbSession, async (transaction) => {
        const before = await Hackathon.findById(id).session(transaction).lean();
        if (!before) throw new Error("Hackathon disappeared during archive.");
        const updated = await Hackathon.findByIdAndUpdate(
          id,
          { status: "archived" },
          {
            returnDocument: "after",
            runValidators: true,
            session: transaction,
          },
        ).lean();
        if (!updated) throw new Error("Hackathon disappeared during archive.");
        return {
          result: updated,
          audit: {
            actor: auditActor(authorization.data.user),
            category: "hackathons" as const,
            action: "status_change" as const,
            operation: "hackathons.archive",
            target: { type: "hackathon", id, label: updated.name },
            before: summarizeHackathon(
              before as unknown as Record<string, unknown>,
            ),
            after: summarizeHackathon(
              updated as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }

    if (!hackathon) {
      return jsonError("NOT_FOUND", "Not found.");
    }

    await invalidateCache("hackathons");
    await invalidateCache("admin:hackathons");

    return jsonOk({ hackathon });
  } catch (err) {
    logger.error("[Hackathon Admin] DELETE error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
