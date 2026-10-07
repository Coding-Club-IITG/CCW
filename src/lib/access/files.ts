/**
 * File Access Control utilities
 *
 * - Admins can manage every file.
 * - Heads and Core Team can upload and manage their own uploads + files in their managed modules.
 * - Members are read-only, subject to each file's ACL.
 */

import type {
  ClubPosition,
  ModuleName,
  RoleModuleName,
  ModulePosition,
  UserRole,
} from "@/lib/constants";
import { isElevated, isAdmin, getModules } from "@/lib/access/roles";

interface ManageableFile {
  uploadedBy: unknown;
  uploaderModule?: ModuleName | null;
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
  managedModules: readonly ModuleName[],
  file: ManageableFile,
): boolean {
  if (isAdmin(access)) return true;

  const modules = isElevated(access) ? getModules(access, managedModules) : [];

  // Module heads
  if (
    modules.length > 0 &&
    file.uploaderModule &&
    modules.some((module) => module === file.uploaderModule)
  ) {
    return true;
  }

  // Anyone who can upload can always manage their own uploads
  if (String(file.uploadedBy) === userId) return true;

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
 *  • The user belongs to a group in accessControl.allowedGroups.
 */
export function canAccessFile(
  userId: string,
  access: string,
  managedModules: readonly ModuleName[],
  roles: UserRole[],
  file: AccessibleFile,
  groupIds: readonly unknown[] = [],
): boolean {
  if (canManageFile(userId, access, managedModules, file)) return true;

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
  managedModules: readonly ModuleName[],
  roles: UserRole[],
  groupIds: readonly unknown[] = [],
): Record<string, unknown> {
  // Global admins see everything
  if (isAdmin(access)) return {};

  const modules = isElevated(access) ? getModules(access, managedModules) : [];
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

  if (groupIds.length) {
    conditions.push({ "accessControl.allowedGroups": { $in: groupIds } });
  }

  // Module heads can see files in their modules
  if (modules.length > 0) {
    conditions.push({ uploaderModule: { $in: modules } });
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
