import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
  sessionOptions: {
    refetchInterval: 0,
    refetchOnWindowFocus: false,
  },
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { useSession, signIn, signOut } = authClient;
