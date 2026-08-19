import { z } from "zod";

const integrationEnvSchema = z.object({
  JINA_API_KEY: z.string().trim().min(1).optional(),
});

/** Parsed on demand so tests and CLI commands can set an optional key before use */
export function getIntegrationEnv() {
  return integrationEnvSchema.parse(process.env);
}
