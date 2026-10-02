import { isAdmin, isHead } from "@/lib/access/roles";
import type { ModuleName } from "@/lib/constants";

export function canManageSharingGroup(
  userId: string,
  access: string,
  managedModules: readonly ModuleName[],
  group: { createdBy: unknown; module?: ModuleName | null },
): boolean {
  return (
    isAdmin(access) ||
    (isHead(access) &&
      (String(group.createdBy) === userId ||
        Boolean(group.module && managedModules.includes(group.module))))
  );
}
