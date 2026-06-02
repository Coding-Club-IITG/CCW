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
import {
  ParsedModuleRole,
  isAdmin,
  isGlobalAdmin,
  isModuleHead,
  getHeadModules,
} from "@/lib/roles";

// Shared types

// Minimal user shape
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  moduleRoles?: any;
}

// Upload permission
export function canUploadFiles(role: string): boolean {
  return isAdmin(role) || isModuleHead(role);
}

// Management permission
export function canManageFile(
  userId: string,
  role: string,
  moduleRoles: ParsedModuleRole[],
  file: Pick<IFileEntry, "uploadedBy" | "uploaderModule">,
): boolean {
  if (isGlobalAdmin(role)) return true;

  const headModules = getHeadModules(role, moduleRoles);

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
 *  • The user's global role is in accessControl.allowedGlobalRoles.
 *  • Any of the user's modules is in accessControl.allowedModules.
 *  • Any of the user's module roles is in accessControl.allowedModuleRoles.
 *  • The user's ID is in accessControl.allowedUsers.
 */
export function canAccessFile(
  userId: string,
  role: string,
  moduleRoles: ParsedModuleRole[],
  file: IFileEntry,
): boolean {
  if (canManageFile(userId, role, moduleRoles, file)) return true;

  const acl = file.accessControl;

  if (acl.allMembers) return true;
  if (acl.allowedGlobalRoles.includes(role)) return true;

  const userModules = moduleRoles.map((mr) => mr.module);
  if (acl.allowedModules.some((m) => userModules.includes(m))) return true;

  const userModuleRoleValues = moduleRoles.map((mr) => mr.role).filter(Boolean);
  if (
    acl.allowedModuleRoles.some((r) =>
      userModuleRoleValues.includes(r as string),
    )
  )
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
  role: string,
  moduleRoles: ParsedModuleRole[],
): Record<string, any> {
  // Global admins see everything
  if (isGlobalAdmin(role)) return {};

  const headModules = getHeadModules(role, moduleRoles);
  const userModules = moduleRoles.map((mr) => mr.module);
  const userModuleRoleValues = moduleRoles
    .map((mr) => mr.role)
    .filter(Boolean) as string[];

  const conditions: Record<string, any>[] = [
    // Owner can always see their own files
    { uploadedBy: userId },
    // Files shared with all members
    { "accessControl.allMembers": true },
    // Files shared with the user's global role
    { "accessControl.allowedGlobalRoles": role },
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

  // Files shared with the user's module roles
  if (userModuleRoleValues.length > 0) {
    conditions.push({
      "accessControl.allowedModuleRoles": { $in: userModuleRoleValues },
    });
  }

  return { $or: conditions };
}
