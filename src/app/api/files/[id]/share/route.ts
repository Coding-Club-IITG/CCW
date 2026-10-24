import { NextRequest } from "next/server";

import { parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonOk, jsonResult } from "@/lib/api/result.server";
import { objectIdParamsSchema } from "@/lib/api/schemas/boundary";
import { shareFileSchema } from "@/lib/api/schemas/files";
import { auditActor } from "@/lib/audit/index";
import { summarizeFileSharing } from "@/lib/audit/summary";
import { requireSession } from "@/lib/auth/session";
import { normalizeAccessControl } from "@/lib/files/accessControl";
import { notifyFileShared } from "@/lib/files/notifications";
import {
  fileErrorResponse,
  fileFailure,
  lockSharingGroups,
  mutateFiles,
  requireFileManagement,
} from "@/lib/files/server";

import FileEntry, { type IFileEntry } from "@/models/FileEntry";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSession(request);
    if (!auth.ok) return jsonResult(auth);
    const params = parseRouteParams(await context.params, objectIdParamsSchema);
    if (!params.ok) return jsonResult(params);
    const parsed = await parseJson(request, shareFileSchema);
    if (!parsed.ok) return jsonResult(parsed);
    const { id } = params.data;
    const { updatedAt, ...sharing } = parsed.data;
    const user = auth.data.user;
    await mutateFiles(async (session) => {
      const file = await FileEntry.findById(id)
        .session(session)
        .lean<IFileEntry>();
      if (!file) fileFailure("NOT_FOUND", "File not found.");
      await requireFileManagement(user, file, session);
      if (file.updatedAt.toISOString() !== updatedAt)
        fileFailure(
          "CONFLICT",
          "This file has changed. Refresh the page before saving its access settings.",
        );
      await lockSharingGroups(sharing.accessControl.allowedGroups, session);
      await FileEntry.updateOne({ _id: id }, { $set: sharing }, { session });
      const notificationIds = await notifyFileShared(
        { ...file, accessControl: sharing.accessControl },
        file.accessControl,
        user,
        session,
      );
      return {
        result: undefined,
        notificationIds,
        audit: {
          actor: auditActor(user),
          category: "files",
          action: "update",
          operation: "files.sharing.update",
          target: { type: "file", id, label: file.title },
          before: summarizeFileSharing({
            isDownloadable: file.isDownloadable,
            accessControl: normalizeAccessControl(file.accessControl),
          }),
          after: summarizeFileSharing(sharing),
        },
      };
    });
    return jsonOk({ success: true });
  } catch (error) {
    return fileErrorResponse("files.sharing.update", error, request);
  }
}
