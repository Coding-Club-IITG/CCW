import { z } from "zod";

import { AUTH_PROVIDER_LABELS, type AuthProvider } from "@/lib/constants";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function providerForEmail(email: string): AuthProvider | null {
  const normalized = normalizeEmail(email);
  if (!z.email().safeParse(normalized).success) return null;
  const domain = normalized.split("@")[1];
  return domain === "iitg.ac.in"
    ? "microsoft"
    : domain === "gmail.com"
      ? "google"
      : null;
}

export const approvedEmailSchema = z
  .string()
  .transform(normalizeEmail)
  .refine(
    (email) => providerForEmail(email) !== null,
    "Use an @iitg.ac.in or @gmail.com address.",
  );

export function loginErrorMessage(code: string): {
  title: string;
  message: string;
} {
  const normalized = code.toLowerCase();
  if (
    [
      "unapproved",
      "unauthorized",
      "signup_disabled",
      "account_not_linked",
    ].includes(normalized)
  ) {
    return {
      title: "Account approval needed",
      message: "Site access requires approval from a club administrator.",
    };
  }
  if (
    [
      "incorrect_provider",
      "email_not_verified",
      "unable_to_link_account",
    ].includes(normalized)
  ) {
    return {
      title: "Check your sign-in account",
      message: `Use ${AUTH_PROVIDER_LABELS.microsoft} with your approved @iitg.ac.in account, or Google with your approved @gmail.com account.`,
    };
  }
  return {
    title: "Couldn't sign you in",
    message:
      "Sign-in could not be completed. Close this message and try Login again.",
  };
}
