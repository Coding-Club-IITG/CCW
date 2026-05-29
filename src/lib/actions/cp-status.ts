"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { dbConnect } from "@/lib/mongodb";
import CPUser from "@/models/CPUser";

export type CPStatusResult = {
  ok: boolean;
  cfVerified?: boolean;
  cfVerificationToken?: string;
  cfHandle?: string;
  acVerified?: boolean;
  acVerificationToken?: string;
  acHandle?: string;
  error?: string;
};

// Returns the current user's CP handle verification state for all platforms
export async function getCPStatus(): Promise<CPStatusResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  await dbConnect();

  const cpUser = await CPUser.findOne(
    { userId: session.user.id },
    {
      cfVerified: 1,
      cfVerificationToken: 1,
      cfHandle: 1,
      acVerified: 1,
      acVerificationToken: 1,
      acHandle: 1,
    },
  ).lean();

  return {
    ok: true,
    cfVerified: (cpUser as any)?.cfVerified ?? false,
    cfVerificationToken: (cpUser as any)?.cfVerificationToken ?? "",
    cfHandle: (cpUser as any)?.cfHandle ?? "",
    acVerified: (cpUser as any)?.acVerified ?? false,
    acVerificationToken: (cpUser as any)?.acVerificationToken ?? "",
    acHandle: (cpUser as any)?.acHandle ?? "",
  };
}
