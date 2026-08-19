import { parseWebEnv } from "@/lib/env/schema";

export const webEnv = parseWebEnv(process.env);
