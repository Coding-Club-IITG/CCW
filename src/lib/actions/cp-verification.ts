"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import CPUser from "@/models/CPUser";
import { dbConnect } from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import type { Platform } from "@/lib/constants";

function generateToken(prefix: string) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = `${prefix}-`;
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export async function requestHandleVerification(
  handle: string,
  platform: Platform = "codeforces",
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) return { ok: false, error: "Unauthorized" };

    await dbConnect();

    if (platform === "codeforces") {
      const token = generateToken("CF");
      await CPUser.findOneAndUpdate(
        { userId: session.user.id },
        {
          $set: {
            cfHandle: handle,
            cfVerificationToken: token,
            cfVerificationRequestedAt: new Date(),
            cfVerified: false,
          },
          $setOnInsert: {
            userId: session.user.id,
            cfRating: 0,
            cfRank: "Unrated",
            cfMaxRating: 0,
            cfMaxRank: "Unrated",
            cfAvatar: "",
          },
        },
        { upsert: true, new: true },
      );
      return { ok: true, token };
    } else {
      const token = generateToken("AC");
      await CPUser.findOneAndUpdate(
        { userId: session.user.id },
        {
          $set: {
            acHandle: handle,
            acVerificationToken: token,
            acVerificationRequestedAt: new Date(),
            acVerified: false,
          },
          $setOnInsert: {
            userId: session.user.id,
          },
        },
        { upsert: true, new: true },
      );
      return { ok: true, token };
    }
  } catch (err) {
    logger.error("[cp-verification] requestHandleVerification error:", err);
    return { ok: false, error: "Failed to generate verification token." };
  }
}
