import {
  MODULE_ACCENTS,
  MODULE_DESCRIPTIONS,
  MODULE_POSITIONS,
  ROLE_CLUB_POSITIONS,
  ROLE_MODULES,
  MODULES,
  type AccessLevel,
  type ModuleName,
  type RoleModuleName,
  type UserRole,
} from "@/lib/constants";
import { getModules } from "@/lib/access/roles";
import { parseRoles } from "@/lib/users/roles";

export interface PublicTeamMember {
  _id: string;
  name: string;
  image?: string;
  access?: AccessLevel;
  tenure: string;
  managedModules?: ModuleName[];
  roles: UserRole[];
  bio?: string;
  githubId?: string;
  linkedinUrl?: string;
  pizza_count?: number;
}

export function teamRoles(
  member: Pick<PublicTeamMember, "access" | "managedModules" | "roles">,
): UserRole[] {
  const roles = parseRoles(member.roles).filter(
    (role) =>
      !role.module || role.position === "Head" || role.position === "Core Team",
  );
  if (member.access === "Head" || member.access === "Core Team") {
    const position = member.access;
    roles.push(
      ...getModules(member.access, member.managedModules).map((module) => ({
        module,
        position,
      })),
    );
  }
  return roles.filter(
    (role, index) =>
      roles.findIndex(
        (item) =>
          item.module === role.module && item.position === role.position,
      ) === index,
  );
}

export function visibleTeamMembers(
  members: PublicTeamMember[],
): PublicTeamMember[] {
  return members.filter(
    (member, index) =>
      Boolean(member.image?.trim()) &&
      teamRoles(member).length > 0 &&
      members.findIndex((item) => item._id === member._id) === index,
  );
}

export function publicTeamFilter(
  module?: RoleModuleName,
  { includeCoreTeam = true }: { includeCoreTeam?: boolean } = {},
): Record<string, unknown> {
  const positions = includeCoreTeam ? ["Head", "Core Team"] : ["Head"];
  return {
    tenure: { $type: "string" },
    image: { $type: "string", $regex: /\S/ },
    email: { $ne: "codingclub@iitg.ac.in" },
    $or: [
      ...(!module
        ? [
            {
              roles: {
                $elemMatch: {
                  module: { $exists: false },
                  position: { $in: [...ROLE_CLUB_POSITIONS] },
                },
              },
            },
          ]
        : []),
      {
        roles: {
          $elemMatch: {
            module: module ?? { $in: [...ROLE_MODULES] },
            position: { $in: positions },
          },
        },
      },
      ...(!module || MODULES.includes(module as ModuleName)
        ? [
            {
              access: { $in: positions },
              managedModules: module ?? { $in: [...MODULES] },
            },
          ]
        : []),
    ],
  };
}

export function buildTeamGroups(input: PublicTeamMember[]) {
  const members = visibleTeamMembers(input);
  const groups = [
    {
      id: "leadership",
      title: "Leadership",
      module: undefined,
      accent: "var(--foreground-strong)",
      blurb:
        "Overall coordination, projects and everything that falls between modules.",
    },
    ...ROLE_MODULES.map((module) => ({
      id: module.toLowerCase().replace(/\s+/g, "-"),
      title: module,
      module,
      accent: MODULE_ACCENTS[module],
      blurb: MODULE_DESCRIPTIONS[module],
    })),
  ];
  return groups
    .map((group) => {
      const positionOrder = group.module
        ? MODULE_POSITIONS
        : ROLE_CLUB_POSITIONS;
      const rank = (position: UserRole["position"]) =>
        positionOrder.indexOf(position as never);
      return {
        ...group,
        entries: members
          .flatMap((member) => {
            const positions = teamRoles(member)
              .filter((role) => role.module === group.module)
              .map((role) => role.position)
              .sort((a, b) => rank(a) - rank(b));
            return positions.length
              ? [
                  {
                    member,
                    position: positions.join(" · "),
                    groupTitle: group.title,
                    accent: group.accent,
                    rank: rank(positions[0]),
                  },
                ]
              : [];
          })
          .sort((a, b) => a.rank - b.rank)
          .map(({ rank: _rank, ...entry }) => entry),
      };
    })
    .filter((group) => group.entries.length > 0);
}
