import { describe, expect, it } from "vitest";

import { getVerifiedPlatformHandle } from "./platformIdentity";

describe("verified platform identity", () => {
  const user = { codeforcesId: "Tourist", atcoderId: "chokudai" };
  const cpUser = {
    cfHandle: "tourist",
    cfVerified: true,
    acHandle: "chokudai",
    acVerified: true,
  };

  it("uses the verified canonical Codeforces handle with case-insensitive matching", () => {
    expect(getVerifiedPlatformHandle(user, cpUser, "codeforces")).toBe(
      "tourist",
    );
  });
  it("uses the verified AtCoder handle", () => {
    expect(getVerifiedPlatformHandle(user, cpUser, "atcoder")).toBe("chokudai");
  });
  it("does not transfer verification to a changed profile handle", () => {
    expect(
      getVerifiedPlatformHandle(
        { ...user, codeforcesId: "someone_else" },
        cpUser,
        "codeforces",
      ),
    ).toBeNull();
    expect(
      getVerifiedPlatformHandle(
        { ...user, atcoderId: "someone_else" },
        cpUser,
        "atcoder",
      ),
    ).toBeNull();
  });
  it("requires AtCoder casing to match", () => {
    expect(
      getVerifiedPlatformHandle(
        { ...user, atcoderId: "Chokudai" },
        cpUser,
        "atcoder",
      ),
    ).toBeNull();
  });
  it("requires a stored handle, a profile handle, and verification", () => {
    expect(getVerifiedPlatformHandle(user, null, "codeforces")).toBeNull();
    expect(getVerifiedPlatformHandle({}, cpUser, "codeforces")).toBeNull();
    expect(
      getVerifiedPlatformHandle(
        user,
        { ...cpUser, cfVerified: false },
        "codeforces",
      ),
    ).toBeNull();
    expect(
      getVerifiedPlatformHandle(
        user,
        { ...cpUser, cfHandle: "" },
        "codeforces",
      ),
    ).toBeNull();
    expect(
      getVerifiedPlatformHandle(
        user,
        { ...cpUser, acVerified: false },
        "atcoder",
      ),
    ).toBeNull();
    expect(
      getVerifiedPlatformHandle(user, { ...cpUser, acHandle: "" }, "atcoder"),
    ).toBeNull();
  });
});
