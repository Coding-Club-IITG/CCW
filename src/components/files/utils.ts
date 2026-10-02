import type { AccessControl } from "./types";
export { EMPTY_ACL } from "@/lib/files/accessControl";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

export function aclSummary(
  acl: AccessControl,
  groups: Record<string, string> = {},
): string {
  if (acl.allMembers) return "All Members";
  const parts: string[] = [];
  if (acl.allowedGroups?.length) {
    parts.push(
      acl.allowedGroups.map((id) => groups[id] ?? "Sharing group").join(", "),
    );
  }
  if (acl.allowedModules.length)
    parts.push(`${acl.allowedModules.length} module(s)`);
  if (acl.allowedClubPositions.length)
    parts.push(`${acl.allowedClubPositions.length} role(s)`);
  if (acl.allowedModulePositions.length)
    parts.push(`${acl.allowedModulePositions.length} module position(s)`);
  if (acl.allowedUsers.length)
    parts.push(
      `${acl.allowedUsers.length} ${acl.allowedUsers.length === 1 ? "person" : "people"}`,
    );
  return parts.length ? parts.join(" + ") : "File managers only";
}
