export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  access: string;
  managedModules: string[];
  roles: { module?: string; position: string }[];
  canUpload: boolean;
  isAdmin: boolean;
  isHead: boolean;
  headModules: string[];
}

export interface AccessControl {
  allMembers: boolean;
  allowedModules: string[];
  allowedClubPositions: string[];
  allowedModulePositions: string[];
  allowedUsers: string[];
}

export interface FileEntry {
  _id: string;
  title: string;
  description: string;
  originalName: string;
  mimeType: string;
  size: number;
  folder: string;
  uploadedBy: string;
  uploadedByName: string;
  uploaderModule: string | null;
  isDownloadable: boolean;
  accessControl: AccessControl;
  createdAt: string;
}

export interface UserBasic {
  _id: string;
  name: string;
  email: string;
}
