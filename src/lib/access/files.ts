/**
 * File Access Control utilities
 *
 * - Admins can manage every file.
 * - Heads and Core Team can upload and manage files shared with groups they manage.
 * - Uploaders can always manage their own files.
 * - Members are read-only, subject to each file's ACL.
 */

import type {
  ClubPosition,
  RoleModuleName,
  ModulePosition,
  UserRole,
} from "@/lib/constants";
import { isElevated, isAdmin } from "@/lib/access/roles";

interface ManageableFile {
  uploadedBy: unknown;
  accessControl: { allowedGroups?: readonly unknown[] };
}

interface FileAccessControl {
  allMembers: boolean;
  allowedClubPositions: readonly ClubPosition[];
  allowedModules: readonly RoleModuleName[];
  allowedModulePositions: readonly ModulePosition[];
  allowedUsers: readonly unknown[];
  allowedGroups?: readonly unknown[];
}

export interface AccessibleFile extends ManageableFile {
  accessControl: FileAccessControl;
}

// Upload permission
export function canUploadFiles(access: string): boolean {
  return isElevated(access);
}

// Management permission
export function canManageFile(
  userId: string,
  access: string,
  file: ManageableFile,
  managedGroupIds: readonly unknown[] = [],
): boolean {
  if (isAdmin(access)) return true;

  // Anyone who can upload can always manage their own uploads
  if (String(file.uploadedBy) === userId) return true;
  const managed = new Set(managedGroupIds.map(String));
  return (
    isElevated(access) &&
    Boolean(
      file.accessControl.allowedGroups?.some((id) => managed.has(String(id))),
    )
  );
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
 *  • The user belongs to a group in accessControl.allowedGroups.
 */
export function canAccessFile(
  userId: string,
  access: string,
  roles: UserRole[],
  file: AccessibleFile,
  groupIds: readonly unknown[] = [],
  managedGroupIds: readonly unknown[] = [],
): boolean {
  if (canManageFile(userId, access, file, managedGroupIds)) return true;

  return hasFileGrant(userId, roles, file.accessControl, groupIds);
}

/** Explicit sharing grants */
export function hasFileGrant(
  userId: string,
  roles: UserRole[],
  acl: FileAccessControl,
  groupIds: readonly unknown[] = [],
): boolean {
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
  if (acl.allowedModules.some((module) => userModules.includes(module)))
    return true;

  const userModuleRoleValues = roles
    .filter((role) => role.module)
    .map((role) => role.position);
  if (
    acl.allowedModulePositions.some((position) =>
      userModuleRoleValues.includes(position),
    )
  )
    return true;

  if (acl.allowedUsers.some((uid) => String(uid) === userId)) return true;

  const memberships = new Set(groupIds.map(String));
  if (acl.allowedGroups?.some((id) => memberships.has(String(id)))) return true;

  return false;
}

/**
 * Builds a MongoDB query filter that approximates 'canAccessFile' logic at the
 * database level, reducing the number of documents fetched into memory.
 */
export function buildAccessFilter(
  userId: string,
  access: string,
  roles: UserRole[],
  groupIds: readonly unknown[] = [],
  managedGroupIds: readonly unknown[] = [],
): Record<string, unknown> {
  // Global admins see everything
  if (isAdmin(access)) return {};

  const userModules = roles.flatMap((role) =>
    role.module ? [role.module] : [],
  );
  const clubPositions = roles
    .filter((role) => !role.module)
    .map((role) => role.position);
  const userModuleRoleValues = roles
    .filter((role) => role.module)
    .map((role) => role.position);

  const conditions: Record<string, unknown>[] = [
    // Owner can always see their own files
    { uploadedBy: userId },
    // Files shared with all members
    { "accessControl.allMembers": true },
    // Files shared with the user's club position
    { "accessControl.allowedClubPositions": { $in: clubPositions } },
    // Files shared with the user directly
    { "accessControl.allowedUsers": userId },
  ];

  const accessibleGroups = [
    ...groupIds,
    ...(isElevated(access) ? managedGroupIds : []),
  ];
  if (accessibleGroups.length) {
    conditions.push({
      "accessControl.allowedGroups": { $in: accessibleGroups },
    });
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
