import type { AccessControl } from "./types";

export const EMPTY_ACL: AccessControl = {
  allMembers: false,
  allowedModules: [],
  allowedClubPositions: [],
  allowedModulePositions: [],
  allowedUsers: [],
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// MIME types the browser can render natively without triggering a download
export function isPreviewable(mimeType: string): boolean {
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    mimeType.startsWith("text/") ||
    mimeType === "video/mp4" ||
    mimeType === "video/webm" ||
    mimeType.startsWith("audio/")
  );
}

export function aclSummary(acl: AccessControl): string {
  if (acl.allMembers) return "All Members";
  const parts: string[] = [];
  if (acl.allowedModules.length)
    parts.push(`${acl.allowedModules.length} module(s)`);
  if (acl.allowedClubPositions.length)
    parts.push(`${acl.allowedClubPositions.length} role(s)`);
  if (acl.allowedModulePositions.length)
    parts.push(`${acl.allowedModulePositions.length} module position(s)`);
  if (acl.allowedUsers.length) parts.push(`${acl.allowedUsers.length} user(s)`);
  return parts.length ? parts.join(", ") : "Restricted";
}
