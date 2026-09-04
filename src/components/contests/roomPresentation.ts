import type { ContestRoomTeamDto } from "@/lib/contests/dtos";
import { getDisplayName } from "@/lib/utils";

export function getDisplayTeamName(
  team: ContestRoomTeamDto | undefined,
  format?: string,
): string {
  if (!team) return "Unknown";
  if (
    ["1v1", "solo-tournament"].includes(format ?? "") &&
    team.members.length
  ) {
    return getDisplayName(team.members[0].name, team.members[0].pizza_count);
  }
  return team.name;
}

export function formatRemainingTime(totalSeconds: number): string {
  const clampedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clampedSeconds / 60);
  const seconds = clampedSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export function formatRoomActivityTime(
  timestamp: number,
  now = Date.now(),
): string {
  const elapsedSeconds = Math.floor((now - timestamp) / 1000);

  if (elapsedSeconds < 5) return "just now";
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  return `${Math.floor(elapsedMinutes / 60)}h ago`;
}

export function getContestRoomResultsPath(
  roomId: string,
  format?: string,
  mode?: string,
): string {
  const fromBracket = format === "bracket" || mode === "knockout";

  return `/internal/contests/rooms/${roomId}/result${
    fromBracket ? "?from=bracket" : ""
  }`;
}
