"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { dbConnect } from "@/lib/mongodb";
import CFUser from "@/models/CFUser";

// Returns the current user's CF verification state
export async function getCFStatus(): Promise<{
  ok: boolean;
  cfVerified?: boolean;
  cfVerificationToken?: string;
  cfHandle?: string;
  error?: string;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  await dbConnect();

  const cfUser = await CFUser.findOne(
    { userId: session.user.id },
    { cfVerified: 1, cfVerificationToken: 1, handle: 1 },
  ).lean();

  return {
    ok: true,
    cfVerified: (cfUser as any)?.cfVerified ?? false,
    cfVerificationToken: (cfUser as any)?.cfVerificationToken ?? "",
    // The handle the current token was generated for (may differ from User.codeforcesId
    // if the user changed their input without saving or before verifying)
    cfHandle: (cfUser as any)?.handle ?? "",
  };
}
