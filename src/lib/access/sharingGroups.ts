import { getModules, isAdmin, isElevated } from "@/lib/access/roles";
import type { ModuleName } from "@/lib/constants";

export function canManageSharingGroup(
  userId: string,
  access: string,
  managedModules: readonly ModuleName[],
  group: { createdBy: unknown; module?: ModuleName | null },
): boolean {
  return (
    isAdmin(access) ||
    (isElevated(access) &&
      (String(group.createdBy) === userId ||
        Boolean(
          group.module &&
          getModules(access, managedModules).includes(group.module),
        )))
  );
}
