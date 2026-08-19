import { z } from "zod";

export type RuntimeEnvironment = Record<string, string | undefined>;

const PLACEHOLDER = /^(?:change[-_ ]?me|your[_-]|replace[_-]|example$)/i;

const nonempty = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .trim()
    .min(1, `${name} is required`);

const secret = (name: string, minimum = 1) =>
  nonempty(name).min(minimum, `${name} must be at least ${minimum} characters`);

const urlWithProtocols = (name: string, protocols: string[]) =>
  nonempty(name).superRefine((value, ctx) => {
    try {
      const url = new URL(value);
      if (!protocols.includes(url.protocol)) {
        ctx.addIssue({
          code: "custom",
          message: `${name} must use ${protocols.join(" or ")}`,
        });
      }
    } catch {
      ctx.addIssue({ code: "custom", message: `${name} must be a valid URL` });
    }
  });

const mongoUrl = nonempty("MONGODB_URI").regex(
  /^mongodb(?:\+srv)?:\/\/\S+$/i,
  "MONGODB_URI must be a valid MongoDB URL",
);
const redisUrl = urlWithProtocols("REDIS_URL", ["redis:", "rediss:"]);
const httpUrl = (name: string) => urlWithProtocols(name, ["http:", "https:"]);

const integer = (name: string, fallback: number, min: number, max: number) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : value),
    z.coerce
      .number({ error: `${name} must be a number` })
      .int()
      .min(min)
      .max(max),
  );

const boolean = (name: string, fallback: boolean) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : value),
    z.union(
      [z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")],
      {
        error: `${name} must be true or false`,
      },
    ),
  );

const origins = z
  .string({ error: "TRUSTED_ORIGINS is required" })
  .trim()
  .min(1, "TRUSTED_ORIGINS is required")
  .transform((value, ctx) => {
    const values = value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (values.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "TRUSTED_ORIGINS must not be empty",
      });
      return z.NEVER;
    }
    for (const origin of values) {
      try {
        const url = new URL(origin);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.origin !== origin.replace(/\/$/, "")
        ) {
          throw new Error("invalid origin");
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          message: `TRUSTED_ORIGINS contains an invalid origin`,
        });
        return z.NEVER;
      }
    }
    return values;
  });

const uploadPath = (fallback: string) =>
  z
    .string()
    .trim()
    .min(1)
    .superRefine((value, ctx) => {
      if (value.includes("\0") || /^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
        ctx.addIssue({
          code: "custom",
          message: "must be a filesystem path",
        });
      }
    })
    .default(fallback);

const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const sharedServerSchema = baseSchema.extend({
  MONGODB_URI: mongoUrl,
  REDIS_URL: redisUrl,
});

function withDevelopmentRedisDefault<T>(schema: z.ZodType<T>) {
  return z.preprocess((input) => {
    if (!input || typeof input !== "object") return input;
    const env = input as RuntimeEnvironment;
    if (
      !env.REDIS_URL &&
      (env.NODE_ENV === undefined || env.NODE_ENV === "development")
    ) {
      return { ...env, REDIS_URL: "redis://localhost:6379" };
    }
    return input;
  }, schema);
}

export const sharedServerEnvSchema =
  withDevelopmentRedisDefault(sharedServerSchema);

const operationalSchema = z.object({
  JINA_API_KEY: z.string().trim().min(1).optional(),
  REGISTRATION_DEADLINE_MINUTES: integer(
    "REGISTRATION_DEADLINE_MINUTES",
    3,
    1,
    1440,
  ),
  ROOM_PRE_START_SECONDS: integer("ROOM_PRE_START_SECONDS", 5, 0, 3600),
  DISCONNECT_FORFEIT_TIMEOUT_SECONDS: integer(
    "DISCONNECT_FORFEIT_TIMEOUT_SECONDS",
    90,
    1,
    86400,
  ),
  ROOM_READY_TIMEOUT_MINUTES: integer("ROOM_READY_TIMEOUT_MINUTES", 2, 1, 1440),
  SYNC_COOLDOWN: integer("SYNC_COOLDOWN", 5, 0, 3600),
});

const uploadSchema = z.object({
  FILE_UPLOAD_DIR: uploadPath("uploads/files"),
  BLOG_UPLOAD_DIR: uploadPath("uploads/blog"),
  EVENT_UPLOAD_DIR: uploadPath("uploads/events"),
  PROJECT_UPLOAD_DIR: uploadPath("uploads/projects"),
  AVATAR_UPLOAD_DIR: uploadPath("uploads/avatars"),
});

export const webEnvSchema = withDevelopmentRedisDefault(
  sharedServerSchema
    .extend({
      AUTH_SECRET: secret("AUTH_SECRET", 32),
      BASE_URL: httpUrl("BASE_URL"),
      TRUSTED_ORIGINS: origins,
      AZURE_CLIENT_ID: nonempty("AZURE_CLIENT_ID"),
      AZURE_CLIENT_SECRET: secret("AZURE_CLIENT_SECRET"),
      AZURE_TENANT_ID: nonempty("AZURE_TENANT_ID"),
    })
    .extend(operationalSchema.shape)
    .extend(uploadSchema.shape)
    .superRefine((value, ctx) => {
      if (value.NODE_ENV !== "production") return;
      for (const name of [
        "AUTH_SECRET",
        "AZURE_CLIENT_ID",
        "AZURE_CLIENT_SECRET",
        "AZURE_TENANT_ID",
      ] as const) {
        if (PLACEHOLDER.test(value[name])) {
          ctx.addIssue({
            code: "custom",
            path: [name],
            message: `${name} must not use a placeholder in production`,
          });
        }
      }
    }),
);

export const workerEnvSchema = withDevelopmentRedisDefault(
  sharedServerSchema.extend(operationalSchema.shape).extend(uploadSchema.shape),
);

export const cliEnvSchema = withDevelopmentRedisDefault(
  sharedServerSchema.extend(operationalSchema.shape).extend(uploadSchema.shape),
);

export const testEnvSchema = baseSchema.extend({
  MONGODB_TEST_URI: urlWithProtocols("MONGODB_TEST_URI", [
    "mongodb:",
    "mongodb+srv:",
  ]),
  MONGODB_URI: mongoUrl.optional(),
  REDIS_URL: redisUrl.default("redis://localhost:6379"),
  MOCK_CF_API: boolean("MOCK_CF_API", false),
});

export const browserEnvSchema = z.object({
  NEXT_PUBLIC_DISABLE_NOTIFICATION_POLLING: boolean(
    "NEXT_PUBLIC_DISABLE_NOTIFICATION_POLLING",
    false,
  ),
  NEXT_PUBLIC_SYNC_COOLDOWN: integer("NEXT_PUBLIC_SYNC_COOLDOWN", 5, 0, 3600),
});

export type SharedServerEnv = z.infer<typeof sharedServerEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type CliEnv = z.infer<typeof cliEnvSchema>;
export type TestEnv = z.infer<typeof testEnvSchema>;
export type BrowserEnv = z.infer<typeof browserEnvSchema>;

function formatEnvironmentError(profile: string, error: z.ZodError): Error {
  const lines = error.issues.map((issue) => {
    const variable = issue.path[0] ? String(issue.path[0]) : "environment";
    return `  - ${variable}: ${issue.message}`;
  });
  return new Error(
    `Invalid ${profile} environment configuration:\n${lines.join("\n")}`,
  );
}

export function parseEnvironment<T>(
  profile: string,
  schema: z.ZodType<T>,
  env: RuntimeEnvironment,
): T {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw formatEnvironmentError(profile, parsed.error);
  return parsed.data;
}

export const parseSharedServerEnv = (env: RuntimeEnvironment) =>
  parseEnvironment("shared server", sharedServerEnvSchema, env);
export const parseWebEnv = (env: RuntimeEnvironment) =>
  parseEnvironment("web", webEnvSchema, env);
export const parseWorkerEnv = (env: RuntimeEnvironment) =>
  parseEnvironment("worker", workerEnvSchema, env);
export const parseCliEnv = (env: RuntimeEnvironment) =>
  parseEnvironment("CLI", cliEnvSchema, env);
export const parseTestEnv = (env: RuntimeEnvironment) =>
  parseEnvironment("test", testEnvSchema, env);
export const parseBrowserEnv = (env: RuntimeEnvironment) =>
  parseEnvironment("browser", browserEnvSchema, env);
