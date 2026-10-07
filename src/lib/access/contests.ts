import { isHead, isElevated } from "@/lib/access/roles";
import { err, ok } from "@/lib/api/result";
import { objectIdStringSchema } from "@/lib/api/schemas/contestRoute";
import { connectMongoDB } from "@/lib/db/mongodb";
import { parseRoles } from "@/lib/users/roles";

import ContestMatch, { type IContestMatch } from "@/models/ContestMatch";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import CPUser from "@/models/CPUser";

export type ContestViewer = { id: string; access?: string; roles?: unknown };

export function canManageContest(
  contest: Pick<IContestMatch, "creatorId">,
  viewer: ContestViewer,
  cpUserId?: string,
) {
  return (
    isHead(viewer.access) ||
    (cpUserId !== undefined && String(contest.creatorId) === cpUserId)
  );
}

export function canSpectateContest(
  contest: Pick<IContestMatch, "creatorId" | "spectatorRestriction">,
  viewer: ContestViewer | null | undefined,
  cpUserId?: string,
): boolean {
  if (!viewer) {
    return false;
  }

  const restriction = contest.spectatorRestriction ?? "none";

  if (restriction === "none") {
    return false;
  }

  if (restriction === "all") {
    return true;
  }

  if (restriction === "admin_creator") {
    return canManageContest(contest, viewer, cpUserId);
  }

  if (restriction === "club_members") {
    return (
      canManageContest(contest, viewer, cpUserId) ||
      isElevated(viewer.access) ||
      parseRoles(viewer.roles).length > 0
    );
  }

  return false;
}

async function spectatorPermission(
  contest: IContestMatch,
  viewer: ContestViewer,
) {
  const profile = await CPUser.findOne({ userId: viewer.id })
    .select("_id")
    .lean();

  return canSpectateContest(contest, viewer, profile?._id.toString());
}

export async function authorizeContestView(
  contestId: string,
  viewer: ContestViewer | null | undefined,
) {
  if (!viewer) {
    return err("UNAUTHENTICATED", "Authentication required.");
  }

  if (!objectIdStringSchema.safeParse(contestId).success) {
    return err("VALIDATION_ERROR", "Invalid contest ID.");
  }

  await connectMongoDB();

  const contest = await ContestMatch.findById(contestId);

  if (!contest) {
    return err("NOT_FOUND", "Contest not found.");
  }

  const canSpectate = await spectatorPermission(contest, viewer);
  const isParticipant =
    Boolean(
      contest.registrations?.some(
        (member) => String(member.userId) === viewer.id,
      ),
    ) ||
    Boolean(
      await ContestRoom.exists({
        contestId: contest._id,
        participants: viewer.id,
      }),
    );

  if (!isParticipant && !canSpectate) {
    return err("FORBIDDEN", "You do not have access to this contest.");
  }

  return ok({ contest, canSpectate, isParticipant });
}

export async function authorizeRoomView(
  roomId: string,
  viewer: ContestViewer | null | undefined,
  contestId?: string,
) {
  if (!viewer) {
    return err("UNAUTHENTICATED", "Authentication required.");
  }

  if (
    !objectIdStringSchema.safeParse(roomId).success ||
    (contestId !== undefined &&
      !objectIdStringSchema.safeParse(contestId).success)
  ) {
    return err("VALIDATION_ERROR", "Invalid room or contest ID.");
  }

  await connectMongoDB();

  const room = await ContestRoom.findOne({
    _id: roomId,
    ...(contestId ? { contestId } : {}),
  }).lean();

  if (!room) {
    return err("NOT_FOUND", "Room not found in this contest.");
  }

  const contest = await ContestMatch.findById(room.contestId);

  if (!contest) {
    return err("NOT_FOUND", "Contest not found.");
  }

  // Both the room roster and a team in this contest must admit the viewer
  const team = room.participants.some((id) => String(id) === viewer.id)
    ? await ContestTeam.findOne({
        roomId: room._id,
        members: viewer.id,
        contestId: room.contestId,
      }).lean()
    : null;
  const isParticipant = team !== null;
  const canSpectate = await spectatorPermission(contest, viewer);

  if (!isParticipant && !canSpectate) {
    return err("FORBIDDEN", "You do not have access to this room.");
  }

  return ok({
    room,
    contest,
    teamId: team?._id.toString() ?? null,
    isParticipant,
    isSpectator: !isParticipant,
  });
}
