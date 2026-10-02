import type { ModuleName, UserRole } from "@/lib/constants";
import type { AccessControl } from "@/lib/files/types";
export type { AccessControl } from "@/lib/files/types";

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
  updatedAt: string;
}

export interface AvailableTag {
  tag: string;
  count: number;
}
