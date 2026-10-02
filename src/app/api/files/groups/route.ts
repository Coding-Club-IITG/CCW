import { NextRequest } from "next/server";
import { z } from "zod";

import { isAdmin } from "@/lib/access/roles";
import { parseJson, parseSearchParams } from "@/lib/api/result";
import { jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  optionalSearchQuerySchema,
  paginationQueryFields,
  objectIdParamsSchema,
} from "@/lib/api/schemas/boundary";
import { sharingGroupSchema } from "@/lib/api/schemas/files";
import { auditActor } from "@/lib/audit/index";
import { summarizeSharingGroup } from "@/lib/audit/summary";
import { requireHead, requireSession } from "@/lib/auth/session";
import { connectMongoDB } from "@/lib/db/mongodb";
import {
  fileErrorResponse,
  fileFailure,
  mutateFiles,
  sharingGroupSummary,
  validateGroupMembers,
} from "@/lib/files/server";
import { paginatedResponse, parsePagination } from "@/lib/shared/pagination";
import { prepareSearchQuery } from "@/lib/shared/search";
import { parseManagedModules } from "@/lib/users/roles";

import SharingGroup from "@/models/SharingGroup";

const querySchema = z.object({
  ...paginationQueryFields,
  search: optionalSearchQuerySchema,
  ids: z
    .string()
    .transform((value) => value.split(","))
    .pipe(z.array(objectIdParamsSchema.shape.id).max(100))
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) return jsonResult(auth);
    const query = parseSearchParams(request.nextUrl.searchParams, querySchema);
    if (!query.ok) return jsonResult(query);
    await connectMongoDB();
    const { page, limit, skip } = parsePagination(request.nextUrl.searchParams);
    const search = prepareSearchQuery(query.data.search);
    const filter = {
      ...(search ? { name: { $regex: search.pattern, $options: "i" } } : {}),
      ...(query.data.ids ? { _id: { $in: query.data.ids } } : {}),
    };
    const [groups, total] = await Promise.all([
      SharingGroup.find(filter)
        .sort({ name: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SharingGroup.countDocuments(filter),
    ]);
    return jsonOk(
      paginatedResponse(
        groups.map((group) => sharingGroupSummary(group, auth.data.user)),
        total,
        page,
        limit,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fileErrorResponse("files.groups.list", error, request);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireHead(request);
    if (!auth.ok) return jsonResult(auth);
    const parsed = await parseJson(request, sharingGroupSchema);
    if (!parsed.ok) return jsonResult(parsed);
    const user = auth.data.user;
    const input = parsed.data;
    if (
      input.module &&
      !isAdmin(user.access) &&
      !parseManagedModules(user.managedModules).includes(input.module)
    )
      fileFailure("FORBIDDEN", "Choose one of your managed modules.");
    const group = await mutateFiles(async (session) => {
      await validateGroupMembers(input.memberIds, session);
      const [created] = await SharingGroup.create(
        [{ ...input, createdBy: user.id }],
        { session },
      );
      return {
        result: sharingGroupSummary(created, user),
        audit: {
          actor: auditActor(user),
          category: "files",
          action: "create",
          operation: "files.groups.create",
          target: {
            type: "sharing_group",
            id: String(created._id),
            label: created.name,
          },
          after: summarizeSharingGroup(created.toObject()),
        },
      };
    });
    return jsonOk({ group }, { status: 201 });
  } catch (error) {
    return fileErrorResponse("files.groups.create", error, request);
  }
}
