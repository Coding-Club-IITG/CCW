import mongoose, { type ClientSession } from "mongoose";
import { revalidatePath } from "next/cache";

import { AppResultError, type AppErrorCode } from "@/lib/api/result";
import { boundaryErrorResponse, jsonResult } from "@/lib/api/result.server";
import { canManageSharingGroup } from "@/lib/access/sharingGroups";
import { auditedTransaction } from "@/lib/audit/index";
import type { AuditEventInput } from "@/lib/audit/types";
import type { ModuleName } from "@/lib/constants";
import { connectMongoDB } from "@/lib/db/mongodb";
import { enqueuePushNotifications } from "@/lib/notifications/service";
import { parseManagedModules } from "@/lib/users/roles";

import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

import SharingGroup, { type SharingGroupRecord } from "@/models/SharingGroup";
import User from "@/models/User";

import type { SharingGroupSummary } from "./types";

export function fileFailure(code: AppErrorCode, message: string): never {
  throw new AppResultError({ code, message });
}

export function fileErrorResponse(
  operation: string,
  error: unknown,
  request: Request,
) {
  if (error instanceof AppResultError)
    return jsonResult({ ok: false, error: error.detail });
  return boundaryErrorResponse(operation, error, request);
}

export async function mutateFiles<T>(
  mutation: (session: ClientSession) => Promise<{
    result: T;
    audit: AuditEventInput;
    notificationIds?: string[];
  }>,
): Promise<T> {
  await connectMongoDB();
  const session = await mongoose.startSession();
  try {
    const { result, notificationIds } = await auditedTransaction(
      session,
      async (transaction) => {
        const outcome = await mutation(transaction);
        return { result: outcome, audit: outcome.audit };
      },
    );
    try {
      if (notificationIds?.length)
        await enqueuePushNotifications(notificationIds);
      revalidatePath("/internal/files");
    } catch (error) {
      logger.warn(
        "File mutation committed, but post-commit notification or invalidation failed",
        { operation: "files.post_commit", ...errorToLogMetadata(error) },
      );
    }
    return result;
  } finally {
    await session.endSession().catch((error) =>
      logger.warn("File session cleanup failed", {
        operation: "files.end_session",
        ...errorToLogMetadata(error),
      }),
    );
  }
}

export async function memberGroupIds(userId: string) {
  const groups = await SharingGroup.find({ memberIds: userId })
    .select("_id")
    .lean();
  return groups.map((group) => group._id);
}

export async function validateGroupMembers(
  memberIds: string[],
  session: ClientSession,
) {
  const count = await User.countDocuments({ _id: { $in: memberIds } }).session(
    session,
  );
  if (count !== memberIds.length)
    fileFailure(
      "VALIDATION_ERROR",
      "Some members no longer exist. Refresh the member selection.",
    );
}

export async function lockSharingGroups(
  groupIds: string[],
  session: ClientSession,
) {
  if (!groupIds.length) return;
  const result = await SharingGroup.updateMany(
    { _id: { $in: groupIds } },
    { $inc: { grantRevision: 1 } },
    { session, timestamps: false },
  );
  if (result.matchedCount !== groupIds.length)
    fileFailure(
      "VALIDATION_ERROR",
      "Some sharing groups no longer exist. Refresh the group selection.",
    );
}

export function sharingGroupSummary(
  group: SharingGroupRecord & { _id: unknown },
  user: { id: string; access: string; managedModules?: unknown },
): SharingGroupSummary {
  return {
    id: String(group._id),
    name: group.name,
    description: group.description,
    module: group.module as ModuleName | null,
    memberCount: group.memberIds.length,
    canManage: canManageSharingGroup(
      user.id,
      user.access,
      parseManagedModules(user.managedModules),
      group,
    ),
  };
}
