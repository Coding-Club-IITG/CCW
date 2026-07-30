import { Types } from "mongoose";

export const HACKATHON_OWNER_ID = "hackathon-owner";
export const HACKATHON_MEMBER_ID = "hackathon-member";
export const HACKATHON_INVITEE_ID = "hackathon-invitee";

export function hackathon(overrides: Record<string, unknown> = {}) {
  return {
    name: "Build Sprint",
    organization: "Coding Club",
    minMembers: 1,
    maxMembers: 3,
    skills: ["TypeScript"],
    websiteUrl: "https://example.test/hackathon",
    ogImage: "",
    deadline: new Date("2030-08-03T00:00:00.000Z"),
    description: "Build something useful",
    status: "active",
    createdBy: "admin-1",
    ...overrides,
  };
}

export function hackathonTeam(
  hackathonId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  return {
    hackathonId,
    name: "Team Deterministic",
    owner: HACKATHON_OWNER_ID,
    members: [HACKATHON_OWNER_ID],
    description: "A test team",
    status: "open",
    ...overrides,
  };
}

export function hackathonSession(userOverrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: HACKATHON_MEMBER_ID,
      name: "Hackathon Member",
      email: "hackathon-member@example.test",
      role: "Member",
      moduleRoles: [],
      ...userOverrides,
    },
    session: {
      id: "hackathon-session",
      userId: HACKATHON_MEMBER_ID,
      expiresAt: new Date("2031-01-01T00:00:00.000Z"),
    },
  };
}
