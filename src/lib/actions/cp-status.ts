"use server";

import { err as appError, ok } from "@/lib/api/result";

import { defineAction } from "@/lib/actions/defineAction";

export const getCPStatus = defineAction("getCPStatus", getCPStatusAction);

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { dbConnect } from "@/lib/mongodb";
import CPUser from "@/models/CPUser";

export type CPStatusResult = {
  cfVerified: boolean;
  cfVerificationToken: string;
  cfHandle: string;
  acVerified: boolean;
  acVerificationToken: string;
  acHandle: string;
};

// Returns the current user's CP handle verification state for all platforms
async function getCPStatusAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return appError("UNAUTHENTICATED", "Unauthorized");

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

  return ok({
    cfVerified: cpUser?.cfVerified ?? false,
    cfVerificationToken: cpUser?.cfVerificationToken ?? "",
    cfHandle: cpUser?.cfHandle ?? "",
    acVerified: cpUser?.acVerified ?? false,
    acVerificationToken: cpUser?.acVerificationToken ?? "",
    acHandle: cpUser?.acHandle ?? "",
  });
}
