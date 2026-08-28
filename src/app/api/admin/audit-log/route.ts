import { NextRequest } from "next/server";
import { z } from "zod";

import { requireHead } from "@/lib/api/auth";
import { parseSearchParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { AUDIT_ACTIONS, AUDIT_CATEGORIES } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import { prepareSearchQuery } from "@/lib/search";
import { errorToLogMetadata, logger } from "@/lib/utils";
import AuditLog from "@/models/AuditLog";

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    category: z.enum(AUDIT_CATEGORIES).optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    actor: z.string().trim().max(160).optional(),
    resourceType: z.string().trim().max(64).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start date must not be after the end date.",
    path: ["from"],
  });

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);

    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(searchParams, querySchema);
    if (!parsed.ok) return jsonResult(parsed);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 25 });
    const query = parsed.data;
    const filter: Record<string, unknown> = {};
    if (query.category) filter.category = query.category;
    if (query.action) filter.action = query.action;
    if (query.resourceType) filter["target.type"] = query.resourceType;
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(query.to) } : {}),
      };
    }
    const search = prepareSearchQuery(query.actor ?? "");
    if (search) {
      filter.$or = [
        { "actor.displayName": { $regex: search.pattern, $options: "i" } },
        { "target.label": { $regex: search.pattern, $options: "i" } },
      ];
    }

    await dbConnect();
    const [events, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);
    return jsonOk(
      paginatedResponse(
        events.map((event) => ({
          id: String(event._id),
          actor: event.actor,
          category: event.category,
          action: event.action,
          operation: event.operation,
          target: event.target,
          before: event.before,
          after: event.after,
          createdAt: event.createdAt.toISOString(),
          expiresAt: event.expiresAt.toISOString(),
        })),
        total,
        page,
        limit,
      ),
    );
  } catch (error) {
    logger.error("Audit log listing failed", {
      route: "GET /api/admin/audit-log",
      ...errorToLogMetadata(error),
    });
    return jsonError("INTERNAL_ERROR", "Unable to load the audit log.");
  }
}
