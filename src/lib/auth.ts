import { betterAuth } from "better-auth";
import {
  google,
  microsoft,
  verifyGoogleIdToken,
} from "better-auth/social-providers";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { createAuthEndpoint, getOAuthState } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import {
  authDatabaseHooks,
  authSecurityPlugin,
  authFailure,
  validateLoginIdentity,
  guardLoginCallback,
} from "@/lib/authSecurity";
import { AUTH_COLLECTIONS } from "@/lib/authStore";
import { loginSwitchPlugin } from "@/lib/loginSwitchPlugin";
import { getClient } from "@/lib/mongodb";
import { CURRENT_TENURE } from "@/lib/constants";
import { webEnv } from "@/lib/env/web";
import { err, ok } from "@/lib/api/result";

const developmentAuth = {
  id: "development-auth",
  endpoints: {
    devSignIn: createAuthEndpoint(
      "/dev/sign-in",
      {
        method: "POST",
        body: z.object({ userId: z.string().min(1).max(128) }),
      },
      async (ctx) => {
        if (!webEnv.DEV_AUTH_ENABLED)
          return ctx.json(err("NOT_FOUND", "Not found"), { status: 404 });
        const user = await ctx.context.internalAdapter.findUserById(
          ctx.body.userId,
        );
        if (!user)
          return ctx.json(err("NOT_FOUND", "User not found"), { status: 404 });
        const session = await ctx.context.internalAdapter.createSession(
          user.id,
        );
        if (!session)
          return ctx.json(
            err("INTERNAL_ERROR", "An unexpected error occurred."),
            { status: 500 },
          );
        await setSessionCookie(ctx, { session, user });
        return ctx.json(
          ok({ user: { id: user.id, name: user.name, image: user.image } }),
        );
      },
    ),
  },
};

const client = await getClient();
const db = client.db();

if (!db) {
  throw new Error("MongoDB connection failed");
}

const microsoftOptions = {
  clientId: webEnv.AZURE_CLIENT_ID,
  clientSecret: webEnv.AZURE_CLIENT_SECRET,
  tenantId: webEnv.AZURE_TENANT_ID,
  scope: ["User.Read", "offline_access"],
  prompt: "select_account" as const,
  disableImplicitSignUp: true,
  disableSignUp: true,
};
const instituteProvider = microsoft(microsoftOptions);
const googleOptions =
  webEnv.GOOGLE_CLIENT_ID && webEnv.GOOGLE_CLIENT_SECRET
    ? {
        clientId: webEnv.GOOGLE_CLIENT_ID,
        clientSecret: webEnv.GOOGLE_CLIENT_SECRET,
        prompt: "select_account" as const,
        disableImplicitSignUp: true,
        disableSignUp: true,
      }
    : null;
const googleProvider = googleOptions ? google(googleOptions) : null;

export const auth = betterAuth({
  plugins: [developmentAuth, authSecurityPlugin, loginSwitchPlugin],
  databaseHooks: authDatabaseHooks,
  onAPIError: { errorURL: "/" },
  logger: { disabled: true },
  session: {
    modelName: AUTH_COLLECTIONS.session,
    cookieCache: { enabled: false },
    additionalFields: {
      authProvider: { type: "string", required: false, input: false },
    },
  },
  verification: { modelName: AUTH_COLLECTIONS.verification },
  database: mongodbAdapter(db as any, {
    client: client as any,
  }),

  secret: webEnv.AUTH_SECRET,
  baseURL: webEnv.BASE_URL,
  trustedOrigins: webEnv.TRUSTED_ORIGINS,

  advanced: {
    trustedProxyHeaders: true,
  },

  user: {
    modelName: "users",
    additionalFields: {
      access: {
        type: "string",
        input: false,
        defaultValue: "Member",
      },
      tenure: { type: "string", defaultValue: CURRENT_TENURE, input: false },
      instituteEmail: { type: "string", required: false, input: false },
      managedModules: {
        type: "string",
        input: false,
        defaultValue: "[]",
      },
      roles: {
        type: "string",
        input: false,
        defaultValue: "[]",
      },
      codeforcesId: {
        type: "string",
        input: false,
      },
      atcoderId: {
        type: "string",
        input: false,
      },
      githubId: {
        type: "string",
        input: false,
      },
      linkedinUrl: {
        type: "string",
        input: false,
      },
      bio: {
        type: "string",
        input: false,
      },
      phoneNumber: {
        type: "string",
        input: false,
      },
      pizza_count: {
        type: "number",
        input: false,
        defaultValue: 0,
      },
    },
  },

  socialProviders: {
    microsoft: {
      ...microsoftOptions,
      getUserInfo: async (tokens) =>
        guardLoginCallback(async () => {
          const state = await getOAuthState();
          if (state?.purpose || state?.link) authFailure("incorrect_provider");
          const profile = await instituteProvider.getUserInfo(tokens);
          if (!profile?.user || profile.data.tid !== webEnv.AZURE_TENANT_ID)
            authFailure("incorrect_provider");
          const email = await validateLoginIdentity("microsoft", profile.user);
          return { ...profile, user: { ...profile.user, email } };
        }),
    },
    ...(googleOptions && googleProvider
      ? {
          google: {
            ...googleOptions,
            getUserInfo: async (
              tokens: Parameters<typeof googleProvider.getUserInfo>[0],
            ) =>
              guardLoginCallback(async () => {
                const state = await getOAuthState();
                if (state?.purpose || state?.link)
                  authFailure("incorrect_provider");
                if (
                  !tokens.idToken ||
                  !(await verifyGoogleIdToken({
                    token: tokens.idToken,
                    audience: googleOptions.clientId,
                  }))
                )
                  authFailure("incorrect_provider");
                const profile = await googleProvider.getUserInfo(tokens);
                if (!profile?.user) authFailure("incorrect_provider");
                const email = await validateLoginIdentity(
                  "google",
                  profile.user,
                );
                return { ...profile, user: { ...profile.user, email } };
              }),
          },
        }
      : {}),
  },

  account: {
    modelName: AUTH_COLLECTIONS.account,
    accountLinking: {
      enabled: true,
      trustedProviders: ["microsoft"],
    },
  },
});

export type AuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;
export type AuthUser = AuthSession["user"];
