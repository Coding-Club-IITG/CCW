import * as dotenv from "dotenv";
import path from "node:path";

/** Load local dotenv files for standalone workers and scripts. Next.js does this itself. */
export function loadEnvironmentFiles(cwd = process.cwd()): void {
  dotenv.config({ path: path.resolve(cwd, ".env.local"), quiet: true });
  dotenv.config({ path: path.resolve(cwd, ".env"), quiet: true });
}

loadEnvironmentFiles();

export * from "@/lib/env/schema";
