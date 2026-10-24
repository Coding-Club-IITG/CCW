import { isAdmin, isElevated } from "@/lib/access/roles";

export function canManageSharingGroup(
  userId: string,
  access: string,
  group: { managerIds: readonly unknown[] },
): boolean {
  return (
    isAdmin(access) ||
    (isElevated(access) && group.managerIds.some((id) => String(id) === userId))
  );
}
