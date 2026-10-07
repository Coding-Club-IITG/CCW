import type {
  ClubPosition,
  RoleModuleName,
  ModuleName,
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
  module: ModuleName | null;
  memberCount: number;
  canManage: boolean;
}

export interface SharingGroupDetail extends SharingGroupSummary {
  memberIds: string[];
  members: Array<{ id: string; name: string; image?: string | null }>;
  fileCount: number;
  version: number;
}
