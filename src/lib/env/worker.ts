import { parseWorkerEnv } from "@/lib/env/schema";

export const workerEnv = parseWorkerEnv(process.env);
