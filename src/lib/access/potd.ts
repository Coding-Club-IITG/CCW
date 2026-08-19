import type { UserRole } from "@/lib/constants";
import { isHead } from "@/lib/access/roles";

/** Heads and CP Core Team may set POTD */
export function canSetPOTD(
  access?: string,
  roles: readonly UserRole[] = [],
): boolean {
  return (
    isHead(access) ||
    roles.some(
      (role) =>
        role.module === "Competitive Programming" &&
        role.position === "Core Team",
    )
  );
}
