import { describe, expect, it } from "vitest";

import {
  approvedEmailSchema,
  loginErrorMessage,
  normalizeEmail,
  providerForEmail,
} from "@/lib/auth/policy";

describe("approved authentication policy", () => {
  it("normalizes exact domains without rewriting Gmail aliases", () => {
    expect(approvedEmailSchema.parse(" A.B+alumni@GMAIL.COM ")).toBe(
      "a.b+alumni@gmail.com",
    );
    expect(providerForEmail(" NAME@IITG.AC.IN ")).toBe("microsoft");
    expect(normalizeEmail("A+tag@gmail.com")).not.toBe(
      normalizeEmail("a@gmail.com"),
    );
  });
  it.each([
    "a@evilgmail.com",
    "a@googlemail.com",
    "a@alumni.iitg.ac.in",
    "a@iitg.ac.in.evil.test",
    "bad@gmail.com@iitg.ac.in",
    "a@outlook.com",
    "a @gmail.com",
  ])("rejects %s", (email) => {
    expect(providerForEmail(email)).toBeNull();
    expect(approvedEmailSchema.safeParse(email).success).toBe(false);
  });
  it("only presents safe errors", () => {
    expect(loginErrorMessage("signup_disabled").message).toContain("approval");
    expect(loginErrorMessage("incorrect_provider").title).toContain("account");
    expect(loginErrorMessage("secret raw oauth failure").message).not.toContain(
      "secret",
    );
  });
});
