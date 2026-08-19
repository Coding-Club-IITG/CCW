import { parseTestEnv } from "@/lib/env/schema";

export const testEnv = parseTestEnv(process.env);
