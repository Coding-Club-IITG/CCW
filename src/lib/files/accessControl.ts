import type { AccessControl } from "./types";

export const EMPTY_ACL: AccessControl = {
  allMembers: false,
  allowedModules: [],
  allowedClubPositions: [],
  allowedModulePositions: [],
  allowedUsers: [],
  allowedGroups: [],
};

type StoredAccessControl = Omit<
  Partial<AccessControl>,
  "allowedUsers" | "allowedGroups"
> & {
  allowedUsers?: readonly unknown[];
  allowedGroups?: readonly unknown[];
};

export function normalizeAccessControl(
  acl: StoredAccessControl,
): AccessControl {
  return {
    ...EMPTY_ACL,
    ...acl,
    allowedUsers: (acl.allowedUsers ?? []).map(String),
    allowedGroups: (acl.allowedGroups ?? []).map(String),
  };
}
