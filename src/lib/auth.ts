import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getClient } from "@/lib/mongodb";
import { CURRENT_TENURE } from "@/lib/constants";
import { webEnv } from "@/lib/env/web";

const client = await getClient();
const db = client.db();

if (!db) {
  throw new Error("MongoDB connection failed");
}

export const auth = betterAuth({
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
