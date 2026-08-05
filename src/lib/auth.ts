import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getClient } from "@/lib/mongodb";
import { CURRENT_TENURE } from "@/lib/constants";

const client = await getClient();
const db = client.db();

if (!process.env.AUTH_SECRET) {
  throw new Error("AUTH_SECRET environment variable is required");
}

if (!db) {
  throw new Error("MongoDB connection failed");
}

export const auth = betterAuth({
  database: mongodbAdapter(db as any, {
    client: client as any,
  }),

  secret: process.env.AUTH_SECRET,
  baseURL: process.env.BASE_URL,
  trustedOrigins: process.env.TRUSTED_ORIGINS
    ? process.env.TRUSTED_ORIGINS.split(",")
    : [],

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
      clientId: process.env.AZURE_CLIENT_ID as string,
      clientSecret: process.env.AZURE_CLIENT_SECRET as string,
      tenantId: process.env.AZURE_TENANT_ID as string,
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
