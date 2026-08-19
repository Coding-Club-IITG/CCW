import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
  sessionOptions: {
    refetchInterval: 0,
    refetchOnWindowFocus: false,
  },
});

export const { useSession, signIn, signOut } = authClient;
