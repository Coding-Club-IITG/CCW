import { describe, expect, it } from "vitest";
import { CURRENT_TENURE } from "@/lib/constants";
import {
  buildTeamGroups,
  teamRoles,
  visibleTeamMembers,
  type PublicTeamMember,
} from "./team";

const member = (
  overrides: Partial<PublicTeamMember> = {},
): PublicTeamMember => ({
  _id: "one",
  name: "Member",
  tenure: CURRENT_TENURE,
  image: "/avatar.png",
  roles: [],
  ...overrides,
});

describe("public team roster", () => {
  it("retains distinct titles once per person and group", () => {
    const person = member({
      access: "Core Team",
      managedModules: ["Design"],
      roles: [
        { module: "Design", position: "Head" },
        { module: "Design", position: "Head" },
        { module: "Design", position: "Core Team" },
        { position: "Secretary" },
        { position: "OC" },
      ],
    });
    const groups = buildTeamGroups([person, person]);
    expect(
      groups.map((group) => [
        group.title,
        group.entries.length,
        group.entries[0].position,
      ]),
    ).toEqual([
      ["Leadership", 1, "Secretary · OC"],
      ["Design", 1, "Head · Core Team"],
    ]);
    expect(visibleTeamMembers([person, person])).toHaveLength(1);
  });
  it("includes historical leadership, development Heads and CP Core Team", () => {
    const person = member({
      tenure: "2025-26",
      roles: [
        { position: "Operations Manager" },
        { module: "Web Development", position: "Head" },
        { module: "App Development", position: "Head" },
        { module: "Competitive Programming", position: "Core Team" },
      ],
    });
    const groups = buildTeamGroups([person]);
    expect(groups).toHaveLength(4);
    expect(
      groups
        .filter((group) => group.title.endsWith("Development"))
        .map((group) => group.accent),
    ).toEqual([
      "var(--module-software-accent)",
      "var(--module-software-accent)",
    ]);
  });
  it("requires photos and eligible positions and never derives titles from Member or Admin", () => {
    expect(
      visibleTeamMembers([
        member({ image: "  ", access: "Head", managedModules: ["Design"] }),
        member({
          _id: "two",
          image: undefined,
          roles: [{ position: "Secretary" }],
        }),
        member({
          _id: "three",
          roles: [{ module: "Design", position: "Coordinator" }],
        }),
        member({ _id: "four", access: "Admin", managedModules: ["Design"] }),
      ]),
    ).toEqual([]);
    expect(
      teamRoles(member({ access: "Member", managedModules: ["Design"] })),
    ).toEqual([]);
  });
  it("changes tenure membership without duplicating account history", () => {
    const person = member({ access: "Head", managedModules: ["Design"] });
    const previous = [{ ...person, tenure: "2025-26" }];
    expect(
      visibleTeamMembers(previous).filter(
        (item) => item.tenure === CURRENT_TENURE,
      ),
    ).toHaveLength(0);
    expect(buildTeamGroups(previous)[0].entries).toHaveLength(1);
  });
});
