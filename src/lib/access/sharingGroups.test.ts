import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { canManageSharingGroup } from "./sharingGroups";

describe("sharing group management", () => {
  const managerId = new Types.ObjectId();
  const group = { createdBy: "owner", managerIds: ["owner", managerId] };

  it.each(["Head", "Core Team"])(
    "allows admins and explicit %s managers",
    (access) => {
      expect(canManageSharingGroup("other", "Admin", group)).toBe(true);
      expect(canManageSharingGroup("owner", access, group)).toBe(true);
      expect(canManageSharingGroup(String(managerId), access, group)).toBe(
        true,
      );
      expect(canManageSharingGroup("other", access, group)).toBe(false);
    },
  );

  it("revokes management when a manager loses elevated access or is removed", () => {
    expect(
      canManageSharingGroup("owner", "Head", {
        ...group,
        managerIds: [managerId],
      }),
    ).toBe(false);
    expect(canManageSharingGroup("owner", "Member", group)).toBe(false);
    expect(canManageSharingGroup(String(managerId), "Member", group)).toBe(
      false,
    );
    expect(
      canManageSharingGroup(String(managerId), "Head", {
        ...group,
        managerIds: [],
      }),
    ).toBe(false);
  });
});
