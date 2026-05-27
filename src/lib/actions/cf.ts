"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import CFUser from "@/models/CFUser";
import { dbConnect } from "@/lib/mongodb";
import { logger } from "@/lib/utils";

function generateToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "CF-";
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export async function requestHandleVerification(
  handle: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) return { ok: false, error: "Unauthorized" };

    await dbConnect();
    const token = generateToken();

    // Only update CFUser — do NOT save to User.codeforcesId here.
    // The handle is committed to User either on explicit "Save Profile" or after
    // successful verification, keeping both paths consistent.
    // Upsert a CFUser record to hold the pending verification state
    await CFUser.findOneAndUpdate(
      { userId: session.user.id },
      {
        $set: {
          handle,
          cfVerificationToken: token,
          cfVerificationRequestedAt: new Date(),
          cfVerified: false,
        },
        $setOnInsert: {
          userId: session.user.id,
          rating: 0,
          rank: "Unrated",
          maxRating: 0,
          maxRank: "Unrated",
          avatar: "",
        },
      },
      { upsert: true, new: true },
    );

    return { ok: true, token };
  } catch (err) {
    logger.error("[cf.ts] requestHandleVerification error:", err);
    return { ok: false, error: "Failed to generate verification token." };
  }
}
