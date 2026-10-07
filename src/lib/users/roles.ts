/**
 * Role checking and parsing utilities
 */

import {
  ACCESS_LEVELS,
  AccessLevel,
  ROLE_CLUB_POSITIONS,
  ROLE_MODULES,
  CURRENT_TENURE,
  HISTORICAL_MODULES,
  HISTORICAL_CLUB_POSITIONS,
  MODULE_POSITIONS,
  MODULES,
  ModuleName,
  UserRole,
} from "@/lib/constants";

export function isValidTenure(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  return !!match && (Number(match[1]) + 1) % 100 === Number(match[2]);
}

export function normalizeTenure(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tenure = value.trim();
  return isValidTenure(tenure) ? tenure : null;
}

export function parseAccess(raw: unknown): AccessLevel {
  return ACCESS_LEVELS.includes(raw as AccessLevel)
    ? (raw as AccessLevel)
    : "Member";
}

function isUserRole(value: unknown): value is UserRole {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.position !== "string") return false;
  if (item.module === undefined)
    return ROLE_CLUB_POSITIONS.includes(item.position as never);
  return (
    ROLE_MODULES.includes(item.module as never) &&
    MODULE_POSITIONS.includes(item.position as never)
  );
}

export function parseRoles(raw: unknown): UserRole[] {
  if (!raw) return [];
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value.filter(isUserRole) : [];
}

export function parseManagedModules(raw: unknown): ModuleName[] {
  if (!raw) return [];
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((item): item is ModuleName =>
            MODULES.includes(item as ModuleName),
          ),
        ),
      ]
    : [];
}

export function getUserRoleLabels(
  access: unknown,
  managedModules: unknown,
  roles: unknown,
): string[] {
  const assignedRoles = parseRoles(roles).map((role) =>
    role.module ? `${role.module} · ${role.position}` : role.position,
  );
  const managedModuleRoles =
    access === "Head" || access === "Core Team"
      ? parseManagedModules(managedModules).map(
          (module) => `${module} · ${access}`,
        )
      : [];
  const labels = [...new Set([...assignedRoles, ...managedModuleRoles])];
  return labels.length > 0 ? labels : [parseAccess(access)];
}

export function validateRoles(
  raw: unknown,
  tenure?: string,
): { success: true; roles: UserRole[] } | { success: false; error: string } {
  if (!Array.isArray(raw))
    return { success: false, error: "Roles must be an array." };
  if (!raw.every(isUserRole))
    return { success: false, error: "Invalid role combination." };
  const keys = raw.map((role) => `${role.module ?? "club"}:${role.position}`);
  if (new Set(keys).size !== keys.length)
    return { success: false, error: "Duplicate roles are not allowed." };
  if (tenure === CURRENT_TENURE && raw.some(isHistoricalRole))
    return {
      success: false,
      error: "Replace historical assignments before using the current tenure.",
    };
  return { success: true, roles: raw };
}

export function isHistoricalRole(role: UserRole): boolean {
  return role.module
    ? HISTORICAL_MODULES.includes(role.module as never)
    : HISTORICAL_CLUB_POSITIONS.includes(role.position as never);
}
