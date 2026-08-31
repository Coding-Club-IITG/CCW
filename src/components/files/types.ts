import type {
  ClubPosition,
  ModuleName,
  ModulePosition,
  UserRole,
} from "@/lib/constants";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  access: string;
  managedModules: ModuleName[];
  roles: UserRole[];
  canUpload: boolean;
  isAdmin: boolean;
  isHead: boolean;
  headModules: ModuleName[];
}

export interface AccessControl {
  allMembers: boolean;
  allowedModules: ModuleName[];
  allowedClubPositions: ClubPosition[];
  allowedModulePositions: ModulePosition[];
  allowedUsers: string[];
}

export interface FileEntry {
  _id: string;
  title: string;
  description: string;
  originalName: string;
  mimeType: string;
  size: number;
  tags: string[];
  uploadedBy: string;
  uploadedByName: string;
  uploaderModule: ModuleName | null;
  isDownloadable: boolean;
  accessControl: AccessControl;
  createdAt: string;
}

export interface AvailableTag {
  tag: string;
  count: number;
}

export interface UserBasic {
  _id: string;
  name: string;
  email: string;
}
