import { parseBrowserEnv } from "@/lib/env/schema";

// Keep these accesses static: Next.js replaces only statically referenced NEXT_PUBLIC_* values
export const clientEnv = parseBrowserEnv({
  NEXT_PUBLIC_DISABLE_NOTIFICATION_POLLING:
    process.env.NEXT_PUBLIC_DISABLE_NOTIFICATION_POLLING,
  NEXT_PUBLIC_SYNC_COOLDOWN: process.env.NEXT_PUBLIC_SYNC_COOLDOWN,
});
