import { parseSharedServerEnv } from "@/lib/env/schema";

export const sharedServerEnv = parseSharedServerEnv(process.env);
