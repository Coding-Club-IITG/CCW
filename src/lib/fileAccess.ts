/**
 * File Access Control utilities
 *
 * Permission tiers (in order of privilege):
 *  1. Global File Admins (Secretary / OC)  - full control over every file.
 *  2. Admins (+ Core Team)                 - can upload; manage their own uploads
 *                                            and files in modules where they are Head.
 *  3. Module Heads                         - can upload; manage files whose
 *                                            uploaderModule matches one of their modules.
 *  4. Standard members                     - read-only, subject to per-file ACL.
 */

import { IFileEntry } from "@/models/FileEntry";
import type { ModuleName, UserRole } from "@/lib/constants";
import { isHead, isAdmin, getHeadModules } from "@/lib/roles";

// Shared types

// Minimal user shape
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  access: string;
  managedModules?: unknown;
  roles?: unknown;
}

// Upload permission
export function canUploadFiles(access: string): boolean {
  return isHead(access);
}

// Management permission
export function canManageFile(
  userId: string,
  access: string,
  managedModules: ModuleName[],
  file: Pick<IFileEntry, "uploadedBy" | "uploaderModule">,
): boolean {
  if (isAdmin(access)) return true;

  const headModules = getHeadModules(access, managedModules);

  // Module heads
  if (
    headModules.length > 0 &&
    file.uploaderModule &&
    headModules.includes(file.uploaderModule)
  ) {
    return true;
  }

  // Anyone who can upload can always manage their own uploads
  if (file.uploadedBy.toString() === userId) return true;

  return false;
}

// View / download permission

/**
 * Access is granted if any ONE of these conditions is satisfied:
 *  • The user can manage the file.
 *  • accessControl.allMembers is true.
 *  • The user's club position is in accessControl.allowedClubPositions.
 *  • Any of the user's modules is in accessControl.allowedModules.
 *  • Any of the user's module positions is in accessControl.allowedModulePositions.
 *  • The user's ID is in accessControl.allowedUsers.
 */
export function canAccessFile(
  userId: string,
  access: string,
  managedModules: ModuleName[],
  roles: UserRole[],
  file: IFileEntry,
): boolean {
  if (canManageFile(userId, access, managedModules, file)) return true;

  const acl = file.accessControl;

  if (acl.allMembers) return true;
  const clubPositions = roles
    .filter((role) => !role.module)
    .map((role) => role.position);
  if (
    acl.allowedClubPositions.some((position) =>
      clubPositions.includes(position as never),
    )
  )
    return true;

  const userModules = roles.flatMap((role) =>
    role.module ? [role.module] : [],
  );
  if (acl.allowedModules.some((m) => userModules.includes(m))) return true;

  const userModuleRoleValues = roles
    .filter((role) => role.module)
    .map((role) => role.position);
  if (acl.allowedModulePositions.some((r) => userModuleRoleValues.includes(r)))
    return true;

  if (acl.allowedUsers.some((uid) => uid.toString() === userId)) return true;

  return false;
}

/**
 * Builds a MongoDB query filter that approximates 'canAccessFile' logic at the
 * database level, reducing the number of documents fetched into memory.
 */
export function buildAccessFilter(
  userId: string,
  access: string,
  managedModules: ModuleName[],
  roles: UserRole[],
): Record<string, any> {
  // Global admins see everything
  if (isAdmin(access)) return {};

  const headModules = getHeadModules(access, managedModules);
  const userModules = roles.flatMap((role) =>
    role.module ? [role.module] : [],
  );
  const clubPositions = roles
    .filter((role) => !role.module)
    .map((role) => role.position);
  const userModuleRoleValues = roles
    .filter((role) => role.module)
    .map((role) => role.position);

  const conditions: Record<string, any>[] = [
    // Owner can always see their own files
    { uploadedBy: userId },
    // Files shared with all members
    { "accessControl.allMembers": true },
    // Files shared with the user's club position
    { "accessControl.allowedClubPositions": { $in: clubPositions } },
    // Files shared with the user directly
    { "accessControl.allowedUsers": userId },
  ];

  // Module heads can see files in their modules
  if (headModules.length > 0) {
    conditions.push({ uploaderModule: { $in: headModules } });
  }

  // Files shared with the user's modules
  if (userModules.length > 0) {
    conditions.push({ "accessControl.allowedModules": { $in: userModules } });
  }

  // Files shared with the user's module positions
  if (userModuleRoleValues.length > 0) {
    conditions.push({
      "accessControl.allowedModulePositions": { $in: userModuleRoleValues },
    });
  }

  return { $or: conditions };
}
