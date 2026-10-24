import type {
  ClubPosition,
  RoleModuleName,
  ModulePosition,
} from "@/lib/constants";

export interface AccessControl {
  allMembers: boolean;
  allowedModules: RoleModuleName[];
  allowedClubPositions: ClubPosition[];
  allowedModulePositions: ModulePosition[];
  allowedUsers: string[];
  allowedGroups: string[];
}

export interface SharingGroupSummary {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  canManage: boolean;
}

export interface SharingGroupDetail extends SharingGroupSummary {
  managerIds: string[];
  managers: Array<{ id: string; name: string; image?: string | null }>;
  memberIds: string[];
  members: Array<{ id: string; name: string; image?: string | null }>;
  fileCount: number;
  version: number;
}
