import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";

import { normalizeEmail, providerForEmail } from "@/lib/auth/policy";
import { authCollections, authUserId } from "@/lib/auth/identityStore";
import { type AuthProvider } from "@/lib/constants";
import { webEnv } from "@/lib/env/web";
import { logger } from "@/lib/telemetry/logger";

import User from "@/models/User";
import { linkHostAssignmentsForUser } from "@/lib/api/pulse";

export function authFailure(
  code: "incorrect_provider" | "unapproved" | "temporary",
): never {
  throw new APIError("FOUND", undefined, { location: `/?error=${code}` });
}

export async function guardLoginCallback<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAPIError(error)) throw error;
    logger.warn("Authentication provider callback failed", {
      operation: "auth_provider_callback",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    authFailure("temporary");
  }
}

export async function validateLoginIdentity(
  provider: AuthProvider,
  profile: {
    id: string | number;
    email?: string | null;
    emailVerified?: boolean;
  },
) {
  const email = normalizeEmail(profile.email ?? "");
  if (
    providerForEmail(email) !== provider ||
    (provider === "google" && profile.emailVerified !== true)
  )
    authFailure("incorrect_provider");
  const user = await User.findOne({ email }).select("_id email").lean();
  if (!user) authFailure("unapproved");
  const { accounts } = await authCollections();
  const identities = await accounts
    .find({
      $or: [
        { userId: authUserId(String(user._id)) },
        { providerId: provider, accountId: String(profile.id) },
      ],
    })
    .toArray();
  if (
    identities.some(
      (account) =>
        String(account.userId) !== String(user._id) ||
        account.providerId !== provider ||
        account.accountId !== String(profile.id),
    )
  )
    authFailure("incorrect_provider");
  return email;
}

export async function isCurrentAuthSession(session: {
  userId: string;
  authProvider?: unknown;
}) {
  if (session.authProvider === "development") return webEnv.DEV_AUTH_ENABLED;
  const user = await User.findById(session.userId).select("email").lean();
  // Sessions issued before provider stamping were institute sessions.
  return (
    !!user?.email &&
    providerForEmail(user.email) === (session.authProvider ?? "microsoft")
  );
}

export const authDatabaseHooks: NonNullable<
  BetterAuthOptions["databaseHooks"]
> = {
  user: {
    create: {
      before: async () => {
        throw new APIError("FORBIDDEN", {
          code: "UNAPPROVED",
          message: "Account approval required.",
        });
      },
    },
    update: {
      before: async (data) => {
        if (data.email !== undefined)
          throw new APIError("FORBIDDEN", {
            message: "Login changes require review.",
          });
        return { data };
      },
    },
  },
  account: {
    create: {
      before: async (account, ctx) => {
        const provider = ctx?.params?.id;
        if (
          !ctx?.path?.startsWith("/callback/") ||
          provider !== account.providerId
        )
          throw new APIError("FORBIDDEN", {
            message: "Account linking is disabled.",
          });
        const user = await User.findById(account.userId).select("email").lean();
        const { accounts } = await authCollections();
        if (
          !user?.email ||
          providerForEmail(user.email) !== provider ||
          (await accounts.findOne({ userId: authUserId(account.userId) }))
        )
          throw new APIError("FORBIDDEN", {
            message: "Account linking is disabled.",
          });
        return { data: account };
      },
    },
  },
  session: {
    create: {
      before: async (session, ctx) => {
        const provider =
          ctx?.path === "/dev/sign-in" && webEnv.DEV_AUTH_ENABLED
            ? "development"
            : ctx?.params?.id;
        if (
          !["microsoft", "google", "development"].includes(provider ?? "") ||
          !(await isCurrentAuthSession({ ...session, authProvider: provider }))
        )
          throw new APIError("FORBIDDEN", {
            code: "INCORRECT_PROVIDER",
            message: "Use your current sign-in method.",
          });
        return { data: { ...session, authProvider: provider } };
      },
      after: async (session, ctx) => {
        // After session is created, link any pre-assigned host assignments
        // to the newly authenticated user
        try {
          const userId = session.userId;
          const user = await User.findById(userId).select("email").lean();
          if (user && user.email) {
            const normalizedEmail = normalizeEmail(user.email);
            await linkHostAssignmentsForUser({ userId, email: normalizedEmail });
          }
        } catch (error) {
          // Log the error but don't fail the session creation
          logger.warn("Failed to link host assignments during session creation", {
            error: error instanceof Error ? error.message : String(error),
            userId: session.userId,
          });
        }
      },
    },
  },
};

export const authSecurityPlugin: BetterAuthPlugin = {
  id: "auth-security",
  databaseHooks: authDatabaseHooks,
} as unknown as BetterAuthPlugin;