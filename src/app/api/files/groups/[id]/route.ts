import { NextRequest } from "next/server";

import { canManageSharingGroup } from "@/lib/access/sharingGroups";
import { isAdmin } from "@/lib/access/roles";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonOk, jsonResult } from "@/lib/api/result.server";
import { objectIdParamsSchema } from "@/lib/api/schemas/boundary";
import {
  sharingGroupDeleteSchema,
  sharingGroupUpdateSchema,
} from "@/lib/api/schemas/files";
import { auditActor } from "@/lib/audit/index";
import { summarizeSharingGroup } from "@/lib/audit/summary";
import { requireElevated, requireSession } from "@/lib/auth/session";
import { connectMongoDB } from "@/lib/db/mongodb";
import { notifyGroupFileAccess } from "@/lib/files/notifications";
import {
  fileErrorResponse,
  fileFailure,
  mutateFiles,
  sharingGroupSummary,
  validateGroupMembers,
} from "@/lib/files/server";
import { parseManagedModules } from "@/lib/users/roles";
import { getDisplayName } from "@/lib/users/identity";

import FileEntry from "@/models/FileEntry";
import SharingGroup from "@/models/SharingGroup";
import User from "@/models/User";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) return jsonResult(auth);
    const params = parseRouteParams(await context.params, objectIdParamsSchema);
    if (!params.ok) return jsonResult(params);
    await connectMongoDB();
    const group = await SharingGroup.findById(params.data.id).lean();
    if (!group) fileFailure("NOT_FOUND", "Sharing group not found.");
    const [fileCount, members] = await Promise.all([
      FileEntry.countDocuments({ "accessControl.allowedGroups": group._id }),
      User.find({ _id: { $in: group.memberIds } })
        .select("name image pizza_count")
        .lean(),
    ]);
    return jsonOk(
      {
        group: {
          ...sharingGroupSummary(group, auth.data.user),
          memberIds: group.memberIds.map(String),
          members: group.memberIds.map((id) => {
            const member = members.find(
              (entry) => String(entry._id) === String(id),
            );
            return {
              id: String(id),
              name: member
                ? getDisplayName(member.name ?? "Member", member.pizza_count)
                : "Unavailable member",
              image: member?.image,
            };
          }),
          fileCount,
          version: group.__v,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fileErrorResponse("files.groups.read", error, request);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  return changeGroup(request, context, false);
}

export async function DELETE(request: NextRequest, context: Context) {
  return changeGroup(request, context, true);
}

async function changeGroup(
  request: NextRequest,
  context: Context,
  deleting: boolean,
) {
  const operation = deleting ? "files.groups.delete" : "files.groups.update";
  try {
    const auth = await requireElevated(request);
    if (!auth.ok) return jsonResult(auth);
    const params = parseRouteParams(await context.params, objectIdParamsSchema);
    if (!params.ok) return jsonResult(params);
    const parsed = await parseJson(
      request,
      deleting ? sharingGroupDeleteSchema : sharingGroupUpdateSchema,
    );
    if (!parsed.ok) return jsonResult(parsed);
    const user = auth.data.user;
    const managedModules = parseManagedModules(user.managedModules);
    await mutateFiles(async (session) => {
      const group = await SharingGroup.findById(params.data.id).session(
        session,
      );
      if (!group) fileFailure("NOT_FOUND", "Sharing group not found.");
      if (!canManageSharingGroup(user.id, user.access, managedModules, group))
        fileFailure("FORBIDDEN", "You cannot manage this sharing group.");
      if (group.__v !== parsed.data.version)
        fileFailure(
          "CONFLICT",
          "This group has changed. Reopen it before saving.",
        );
      const before = summarizeSharingGroup(group.toObject());
      let notificationIds: string[] = [];
      let detachedFileCount = 0;
      if (deleting) {
        await group.deleteOne({ session });
        const detached = await FileEntry.updateMany(
          { "accessControl.allowedGroups": group._id },
          { $pull: { "accessControl.allowedGroups": group._id } },
          { session },
        );
        detachedFileCount = detached.modifiedCount;
      } else {
        const input = sharingGroupUpdateSchema.parse(parsed.data);
        if (
          input.module !== group.module &&
          input.module &&
          !isAdmin(user.access) &&
          !managedModules.includes(input.module)
        )
          fileFailure("FORBIDDEN", "Choose one of your managed modules.");
        await validateGroupMembers(input.memberIds, session);
        const existingMembers = new Set(group.memberIds.map(String));
        const addedMemberIds = input.memberIds.filter(
          (id) => !existingMembers.has(id),
        );
        group.set({
          name: input.name,
          description: input.description,
          module: input.module,
          memberIds: input.memberIds,
        });
        await group.save({ session });
        notificationIds = await notifyGroupFileAccess(
          { id: String(group._id), name: group.name },
          addedMemberIds,
          user,
          session,
        );
      }
      return {
        result: undefined,
        notificationIds,
        audit: {
          actor: auditActor(user),
          category: "files",
          action: deleting ? "delete" : "update",
          operation,
          target: {
            type: "sharing_group",
            id: String(group._id),
            label: group.name,
          },
          before,
          after: deleting
            ? { detachedFileCount }
            : summarizeSharingGroup(group.toObject()),
        },
      };
    });
    return jsonOk({ success: true });
  } catch (error) {
    return fileErrorResponse(operation, error, request);
  }
}
