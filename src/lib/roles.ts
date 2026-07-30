/**
 * Role checking and parsing utilities
 */

import {
  LEADERSHIP_ROLES,
  LeadershipRole,
  TEAM_ROLES,
  TeamRole,
} from "@/lib/constants";

export interface ParsedModuleRole {
  module: string;
  role?: string;
}

// Handles both raw array and stringified form
function isParsedModuleRole(value: unknown): value is ParsedModuleRole {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.module === "string" &&
    (item.role === undefined || typeof item.role === "string")
  );
}

export function parseModuleRoles(raw: unknown): ParsedModuleRole[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(isParsedModuleRole);
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isParsedModuleRole) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Global administrators
export function isGlobalAdmin(role?: string): boolean {
  return LEADERSHIP_ROLES.includes(role as LeadershipRole);
}

// Checks if a user has an administrative role
export function isAdmin(role?: string): boolean {
  return TEAM_ROLES.includes(role as TeamRole);
}

// Checks if a user can set POTD problems
export function canSetPOTD(role?: string): boolean {
  return isAdmin(role) || role === "Core Team";
}

// Module Heads
export function isModuleHead(role?: string): boolean {
  return role === "Head";
}

// List of modules for which user is Head
export function getHeadModules(
  role?: string,
  moduleRoles?: ParsedModuleRole[],
): string[] {
  if (role !== "Head" || !moduleRoles) return [];
  return moduleRoles.map((mr) => mr.module);
}

// Enforces role constraints
export function cleanUserRoles(
  role: string,
  moduleRoles: ParsedModuleRole[],
): ParsedModuleRole[] {
  // Heads can only have module, not specific role
  if (role === "Head") return moduleRoles.map((mr) => ({ module: mr.module }));
  if (isAdmin(role)) return []; // Cannot have module roles
  return moduleRoles;
}
