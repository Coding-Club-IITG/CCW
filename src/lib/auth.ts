import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getClient } from "@/lib/mongodb";
import { CURRENT_TENURE } from "@/lib/constants";
import { webEnv } from "@/lib/env/web";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
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

export const auth = betterAuth({
  plugins: [developmentAuth],
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
        defaultValue: "Member",
      },
      tenure: { type: "string", defaultValue: CURRENT_TENURE },
      managedModules: {
        type: "string",
        defaultValue: "[]",
      },
      roles: {
        type: "string",
        defaultValue: "[]",
      },
      codeforcesId: {
        type: "string",
      },
      atcoderId: {
        type: "string",
      },
      githubId: {
        type: "string",
      },
      bio: {
        type: "string",
      },
      phoneNumber: {
        type: "string",
      },
      pizza_count: {
        type: "number",
        defaultValue: 0,
      },
    },
  },

  socialProviders: {
    microsoft: {
      clientId: webEnv.AZURE_CLIENT_ID,
      clientSecret: webEnv.AZURE_CLIENT_SECRET,
      tenantId: webEnv.AZURE_TENANT_ID,
      scope: ["User.Read", "offline_access"],
      prompt: "select_account",
      disableImplicitSignUp: true,
    },
  },

  account: {
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
