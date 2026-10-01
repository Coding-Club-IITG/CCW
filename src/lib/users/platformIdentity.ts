import type { Platform } from "@/lib/constants";

export function getVerifiedPlatformHandle(
  user: { codeforcesId?: string | null; atcoderId?: string | null },
  cpUser: {
    cfHandle?: string | null;
    cfVerified?: boolean;
    acHandle?: string | null;
    acVerified?: boolean;
  } | null,
  platform: Platform,
): string | null {
  const profileHandle =
    platform === "codeforces" ? user.codeforcesId : user.atcoderId;
  const handle =
    platform === "codeforces" ? cpUser?.cfHandle : cpUser?.acHandle;
  const verified =
    platform === "codeforces" ? cpUser?.cfVerified : cpUser?.acVerified;
  if (!verified || !handle || !profileHandle) return null;
  const matches =
    platform === "codeforces"
      ? handle.toLowerCase() === profileHandle.trim().toLowerCase()
      : handle === profileHandle.trim();
  return matches ? handle : null;
}
