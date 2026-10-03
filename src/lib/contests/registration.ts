import mongoose, { type ClientSession } from "mongoose";

import { type AppErrorCode, type AppResult, err, ok } from "@/lib/api/result";
import { mongoErrorResult } from "@/lib/api/result.server";
import type { ContestRegisteredUser } from "@/lib/api/schemas/contestAction";
import { connectMongoDB } from "@/lib/db/mongodb";
import { prepareSearchQuery } from "@/lib/shared/search";

import ContestMatch, {
  type IContestMatch,
  type IRegistration,
} from "@/models/ContestMatch";
import ContestRegistrationTeam, {
  type IContestRegistrationTeam,
} from "@/models/ContestRegistrationTeam";
import ContestTeamRequest from "@/models/ContestTeamRequest";
import CPUser from "@/models/CPUser";
import Notification from "@/models/Notification";

class RegistrationError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function reject(code: AppErrorCode, message: string): never {
  throw new RegistrationError(code, message);
}

// Throwing validation failures aborts any preceding writes in the transaction
export async function registrationTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<AppResult<T>> {
  await connectMongoDB();

  const session = await mongoose.startSession();

  try {
    return ok(await session.withTransaction(() => operation(session)));
  } catch (error) {
    if (error instanceof RegistrationError) {
      return err(error.code, error.message);
    }

    const mapped = mongoErrorResult(error);

    if (!mapped.ok && mapped.error.code !== "INTERNAL_ERROR") {
      return mapped;
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

type RegistrationContest = Pick<
  IContestMatch,
  "status" | "registrationSettings" | "registrations" | "teamSize" | "format"
>;

export function assertRegistrationOpen(
  contest: RegistrationContest,
  now = new Date(),
) {
  const settings = contest.registrationSettings;

  if (
    contest.status !== "registration" ||
    !settings ||
    settings.type !== "open"
  ) {
    reject("VALIDATION_ERROR", "Contest is not open for registration.");
  }

  if (
    !Number.isFinite(settings.deadline?.getTime()) ||
    (settings.startTime && !Number.isFinite(settings.startTime.getTime()))
  ) {
    reject("VALIDATION_ERROR", "Contest registration window is incomplete.");
  }

  if (settings.startTime && now < settings.startTime) {
    reject("VALIDATION_ERROR", "Registration has not started yet.");
  }

  if (now >= settings.deadline) {
    reject("VALIDATION_ERROR", "Registration deadline has passed.");
  }
}

async function openContest(
  contestId: string,
  session: ClientSession,
  requireOpen = true,
) {
  // Serialize membership changes with other joins, departures and provisioning
  const contest = await ContestMatch.findOneAndUpdate(
    { _id: contestId },
    { $inc: { __v: 1 } },
    { session, returnDocument: "after" },
  );

  if (!contest) {
    reject("NOT_FOUND", "Contest not found.");
  }

  if (requireOpen) {
    assertRegistrationOpen(contest);
  }

  return contest;
}

async function verifiedMember(userId: string, session?: ClientSession) {
  const member = await CPUser.findOne({ userId }).session(session ?? null);

  if (!member?.cfVerified || !member.cfHandle?.trim()) {
    reject(
      "VALIDATION_ERROR",
      "Every participant must have a verified Codeforces handle.",
    );
  }

  return { userId: member.userId, cfHandle: member.cfHandle };
}

function assertCapacity(
  contest: RegistrationContest,
  ids: string[],
  teamName?: string,
) {
  const registrations = contest.registrations ?? [];

  if (
    new Set(ids).size !== ids.length ||
    registrations.some((r) => ids.includes(String(r.userId)))
  ) {
    reject("CONFLICT", "A member is already registered for this contest.");
  }

  if (contest.format === "bracket") {
    const entrantCapacity = contest.registrationSettings?.entrantCapacity;

    if (!entrantCapacity) {
      reject("CONFLICT", "Bracket entrant capacity is required.");
    }

    const names = new Set(
      registrations.map((registration) =>
        (contest.teamSize ?? 1) === 1
          ? String(registration.userId)
          : registration.teamName?.toLowerCase(),
      ),
    );
    const additional =
      (contest.teamSize ?? 1) === 1
        ? ids.length
        : names.has(teamName?.toLowerCase())
          ? 0
          : 1;

    if (names.size + additional > entrantCapacity) {
      reject("CONFLICT", "Contest entrant capacity has been reached.");
    }
  }

  const capacity = contest.registrationSettings?.maxParticipants;

  if (!capacity || registrations.length + ids.length > capacity) {
    reject("CONFLICT", "Contest participant capacity has been reached.");
  }

  if (
    teamName &&
    registrations.filter((r) => r.teamName === teamName).length + ids.length >
      (contest.teamSize ?? 1)
  ) {
    reject("CONFLICT", "Team is already full.");
  }
}

async function teamForContest(
  contest: IContestMatch,
  teamId: string,
  session: ClientSession,
) {
  if ((contest.teamSize ?? 1) <= 1) {
    reject("VALIDATION_ERROR", "This contest uses solo registration.");
  }

  const team = await ContestRegistrationTeam.findOne({
    _id: teamId,
    contestId: contest._id,
  }).session(session);

  if (!team) {
    reject("NOT_FOUND", "Team not found in this contest.");
  }

  if (
    !contest.registrations?.some(
      (r) => String(r.userId) === team.leaderId && r.teamName === team.name,
    )
  ) {
    reject("CONFLICT", "Team leader is no longer registered with this team.");
  }

  return team;
}

async function appendMembers(
  contest: IContestMatch,
  ids: string[],
  teamName: string,
  session: ClientSession,
) {
  assertCapacity(contest, ids, teamName);

  const entries: IRegistration[] = [];

  for (const id of ids) {
    entries.push({
      ...(await verifiedMember(id, session)),
      teamName,
      registeredAt: new Date(),
    });
  }

  // Recheck the absolute deadline after validation
  assertRegistrationOpen(contest);
  contest.registrations = [...(contest.registrations ?? []), ...entries];
  await contest.save({ session });
}

async function createTeam(
  contest: IContestMatch,
  name: string,
  leaderId: string,
  isPublic: boolean,
  session: ClientSession,
) {
  const pattern = prepareSearchQuery(name, { maxLength: 200 })!.pattern;
  const exists = await ContestRegistrationTeam.exists({
    contestId: contest._id,
    name: { $regex: `^${pattern}$`, $options: "i" },
  }).session(session);

  if (
    exists ||
    contest.registrations?.some(
      (r) => r.teamName?.toLowerCase() === name.toLowerCase(),
    )
  ) {
    reject("CONFLICT", "A team with this name already exists.");
  }

  const [team] = await ContestRegistrationTeam.create(
    [{ contestId: contest._id, name, leaderId, isPublic }],
    { session },
  );

  return team;
}

export async function registerContestMember(
  userId: string,
  input: { contestId: string; teamName?: string; isPublic?: boolean },
) {
  return registrationTransaction(async (session) => {
    const contest = await openContest(input.contestId, session);
    const member = await verifiedMember(userId, session);
    let name = input.teamName ?? member.cfHandle;

    if ((contest.teamSize ?? 1) > 1) {
      if (!input.teamName) {
        reject("VALIDATION_ERROR", "A team name is required.");
      }

      let team: IContestRegistrationTeam;

      if (input.isPublic !== undefined) {
        team = await createTeam(contest, name, userId, input.isPublic, session);
      } else {
        const pattern = prepareSearchQuery(name, { maxLength: 200 })!.pattern;
        const found = await ContestRegistrationTeam.findOne({
          contestId: contest._id,
          name: { $regex: `^${pattern}$`, $options: "i" },
        }).session(session);

        if (!found) {
          reject("NOT_FOUND", "Team not found.");
        }

        team = await teamForContest(contest, String(found._id), session);

        if (!team.isPublic) {
          reject(
            "FORBIDDEN",
            "Private teams require an invitation or leader-approved join request.",
          );
        }
      }

      name = team.name;
    } else if (
      contest.registrations?.some(
        (r) => r.teamName?.toLowerCase() === name.toLowerCase(),
      )
    ) {
      reject("CONFLICT", "Display name already taken.");
    }

    await appendMembers(contest, [userId], name, session);

    return { message: "Successfully registered" };
  });
}

export async function registerCompleteContestTeam(
  userId: string,
  contestId: string,
  input: { teamName: string; memberIds: string[] },
) {
  return registrationTransaction(async (session) => {
    const contest = await openContest(contestId, session);

    if (
      contest.teamSize !== 3 ||
      input.memberIds.length !== 3 ||
      !input.memberIds.includes(userId)
    ) {
      reject(
        "VALIDATION_ERROR",
        "The registrant must be part of a complete three-person team.",
      );
    }

    await createTeam(contest, input.teamName, userId, true, session);
    await appendMembers(contest, input.memberIds, input.teamName, session);

    return { registered: true };
  });
}

export async function leaveContest(userId: string, contestId: string) {
  return registrationTransaction(async (session) => {
    const contest = await openContest(contestId, session);
    const registration = contest.registrations?.find(
      (r) => String(r.userId) === userId,
    );

    if (!registration) {
      reject("NOT_FOUND", "Not registered.");
    }

    contest.registrations = contest.registrations!.filter(
      (r) => String(r.userId) !== userId,
    );

    if ((contest.teamSize ?? 1) > 1) {
      const team = await ContestRegistrationTeam.findOne({
        contestId,
        name: registration.teamName,
      }).session(session);

      if (team) {
        const remaining = contest.registrations.filter(
          (r) => r.teamName === team.name,
        );

        if (!remaining.length) {
          await ContestRegistrationTeam.deleteOne(
            { _id: team._id },
            { session },
          );
          await ContestTeamRequest.updateMany(
            { contestId, teamId: team._id, status: "pending" },
            { $set: { status: "rejected" } },
            { session },
          );
        } else if (team.leaderId === userId) {
          team.leaderId = String(remaining[0].userId);
          await team.save({ session });
          await ContestTeamRequest.updateMany(
            {
              contestId,
              teamId: team._id,
              fromUserId: userId,
              type: "invite",
              status: "pending",
            },
            { $set: { status: "rejected" } },
            { session },
          );
        }
      }
    }

    assertRegistrationOpen(contest);
    await contest.save({ session });

    return { message: "Successfully unregistered" };
  });
}

export async function sendContestTeamRequest(
  userId: string,
  input: { contestId: string; teamId: string; cfHandle?: string },
) {
  return registrationTransaction(async (session) => {
    const contest = await openContest(input.contestId, session);
    const team = await teamForContest(contest, input.teamId, session);
    const isInvite = input.cfHandle !== undefined;
    let targetId = userId;

    if (isInvite) {
      if (team.leaderId !== userId) {
        reject("FORBIDDEN", "Only the team leader may invite members.");
      }

      await verifiedMember(userId, session);

      const pattern = prepareSearchQuery(input.cfHandle)!.pattern;
      const target = await CPUser.findOne({
        cfHandle: { $regex: `^${pattern}$`, $options: "i" },
      }).session(session);

      if (!target) {
        reject("NOT_FOUND", "Codeforces user not found.");
      }

      targetId = String(target.userId);
    }

    const member = await verifiedMember(targetId, session);

    assertCapacity(contest, [targetId], team.name);

    const type = isInvite ? "invite" : "join_request";
    const duplicate = await ContestTeamRequest.exists({
      contestId: contest._id,
      teamId: team._id,
      type,
      status: "pending",
      ...(isInvite ? { toUserId: targetId } : { fromUserId: userId }),
    }).session(session);

    if (duplicate) {
      reject("CONFLICT", "A matching request is already pending.");
    }

    assertRegistrationOpen(contest);
    await ContestTeamRequest.create(
      [
        {
          contestId: contest._id,
          teamId: team._id,
          type,
          fromUserId: userId,
          ...(isInvite ? { toUserId: targetId } : {}),
          status: "pending",
        },
      ],
      { session },
    );
    await Notification.create(
      [
        {
          userId: isInvite ? targetId : team.leaderId,
          type: isInvite ? "team_invite" : "join_request",
          title: isInvite ? "Contest Team Invite" : "New Team Join Request",
          message: isInvite
            ? `You have been invited to join team ${team.name}.`
            : `${member.cfHandle} has requested to join your team ${team.name}.`,
        },
      ],
      { session },
    );

    return {
      message: isInvite
        ? "Invite sent successfully"
        : "Join request sent successfully",
    };
  });
}

export async function respondToTeamRequest(
  userId: string,
  requestId: string,
  action: "accept" | "reject",
) {
  return registrationTransaction(async (session) => {
    const request =
      await ContestTeamRequest.findById(requestId).session(session);

    if (!request || request.status !== "pending") {
      reject("NOT_FOUND", "Request not found or already processed.");
    }

    const team = await ContestRegistrationTeam.findOne({
      _id: request.teamId,
      contestId: request.contestId,
    }).session(session);

    if (!team) {
      reject("NOT_FOUND", "Team not found in this contest.");
    }

    if (
      (request.type === "join_request" && team.leaderId !== userId) ||
      (request.type === "invite" && request.toUserId !== userId)
    ) {
      reject("FORBIDDEN", "You cannot respond to this request.");
    }

    const contest = await openContest(
      String(request.contestId),
      session,
      action === "accept",
    );

    // Failed acceptance leaves the request pending with every membership write rolled back
    if (action === "accept") {
      await teamForContest(contest, String(team._id), session);

      if (request.type === "invite" && request.fromUserId !== team.leaderId) {
        reject(
          "CONFLICT",
          "The invitation is no longer from this team's leader.",
        );
      }

      const targetId =
        request.type === "join_request" ? request.fromUserId : request.toUserId;

      if (!targetId) {
        reject("VALIDATION_ERROR", "Request has no recipient.");
      }

      await appendMembers(contest, [targetId], team.name, session);
    }

    request.status = action === "accept" ? "accepted" : "rejected";
    await request.save({ session });

    return {
      message:
        action === "accept"
          ? "Request accepted successfully"
          : "Request rejected successfully",
    };
  });
}

// Creation paths use canonical handles too
export async function prepareContestRegistrations(input: {
  registeredUsers: ContestRegisteredUser[];
  registrationType: "open" | "closed";
  teamSize: number;
  maxParticipants: number;
}): Promise<AppResult<IRegistration[]>> {
  try {
    const members = input.registeredUsers;

    if (input.registrationType === "open" && members.length) {
      reject(
        "VALIDATION_ERROR",
        "Open contests cannot include pre-registered users.",
      );
    }

    const ids = members.map((member) => member.id.toLowerCase());

    if (new Set(ids).size !== ids.length) {
      reject("VALIDATION_ERROR", "Each registered user may appear only once.");
    }

    if (members.length > input.maxParticipants) {
      reject(
        "VALIDATION_ERROR",
        "Registered users exceed the participant capacity.",
      );
    }

    if (
      input.registrationType === "closed" &&
      members.length < input.teamSize * 2
    ) {
      reject(
        "VALIDATION_ERROR",
        "Closed contests require at least two complete sides.",
      );
    }

    const counts = new Map<string, number>();
    const canonicalNames = new Map<string, string>();
    const registrations: IRegistration[] = [];

    for (const member of members) {
      const verified = await verifiedMember(member.id);
      let teamName = member.teamName?.trim() || verified.cfHandle;

      if (input.teamSize > 1 && !member.teamName?.trim()) {
        reject("VALIDATION_ERROR", "Every team member needs a team name.");
      }

      const key = teamName.toLowerCase();

      teamName = canonicalNames.get(key) ?? teamName;
      canonicalNames.set(key, teamName);
      counts.set(teamName, (counts.get(teamName) ?? 0) + 1);
      registrations.push({ ...verified, teamName, registeredAt: new Date() });
    }

    if ([...counts.values()].some((count) => count !== input.teamSize)) {
      reject(
        "VALIDATION_ERROR",
        "Every registered side must be complete and have a unique name.",
      );
    }

    return ok(registrations);
  } catch (error) {
    if (error instanceof RegistrationError) {
      return err(error.code, error.message);
    }

    throw error;
  }
}
