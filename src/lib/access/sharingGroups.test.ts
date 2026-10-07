import { describe, expect, it } from "vitest";

import { canManageSharingGroup } from "./sharingGroups";

describe("sharing group management", () => {
  const group = { createdBy: "owner", module: "Design" as const };

  it.each(["Head", "Core Team"])(
    "allows admins, creating %s and scoped managers",
    (access) => {
      expect(canManageSharingGroup("other", "Admin", [], group)).toBe(true);
      expect(canManageSharingGroup("owner", access, [], group)).toBe(true);
      expect(canManageSharingGroup("other", access, ["Design"], group)).toBe(
        true,
      );
    },
  );

  it("does not turn membership or previous head access into management", () => {
    expect(canManageSharingGroup("owner", "Member", ["Design"], group)).toBe(
      false,
    );
    expect(
      canManageSharingGroup("other", "Head", ["Cybersecurity"], group),
    ).toBe(false);
    expect(
      canManageSharingGroup("other", "Head", ["Design"], {
        createdBy: "owner",
      }),
    ).toBe(false);
  });
});
