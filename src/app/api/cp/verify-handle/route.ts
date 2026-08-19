import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseSearchParams } from "@/lib/api/result";
import { z } from "zod";
import { cp } from "@ronits2407/cp-api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import { dbConnect } from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";
import { getUserAffiliation } from "@/lib/platforms/atcoder";
import { acquireDistributedCodeforcesSlot } from "@/lib/platforms/codeforces";
import { errorToLogMetadata, logger } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    // Determine platform from query param
    const { searchParams } = new URL(req.url);
    const query = parseSearchParams(
      searchParams,
      z.object({
        platform: z.enum(["codeforces", "atcoder"]).default("codeforces"),
      }),
    );
    if (!query.ok) return jsonResult(query);
    const platform = query.data.platform;

    await dbConnect();

    const cpUserDoc = await CPUser.findOne({ userId: session.user.id });

    if (platform === "codeforces") {
      return verifyCF(cpUserDoc, session.user.id);
    } else if (platform === "atcoder") {
      return verifyAC(cpUserDoc, session.user.id);
    }
  } catch (error) {
    logger.error("Competitive-programming handle verification failed", {
      route: "POST /api/cp/verify-handle",
      operation: "verify_handle",
      ...errorToLogMetadata(error),
    });
    return jsonError(
      "INTERNAL_ERROR",
      "Unable to verify the handle right now.",
    );
  }
}

async function verifyCF(cpUserDoc: any, userId: string) {
  if (!cpUserDoc?.cfVerificationToken || cpUserDoc.cfVerified) {
    return jsonError("CONFLICT", "Already verified or no token found.");
  }

  const handle = cpUserDoc.cfHandle;
  if (!handle) {
    return jsonError("VALIDATION_ERROR", "No handle pending verification.");
  }

  const redis = await getRedis();
  const redisKey = `cf:verify:lock:${userId}`;
  const isLocked = await redis.get(redisKey);
  if (isLocked) {
    const ttl = await redis.ttl(redisKey);
    return jsonError("RATE_LIMITED", `Try again in ${ttl} seconds`);
  }

  const cfLocked = await acquireDistributedCodeforcesSlot();
  if (!cfLocked) {
    return jsonError(
      "RATE_LIMITED",
      "Codeforces is busy, please try again in a few seconds.",
    );
  }

  await redis.set(redisKey, "1", { EX: 60 });

  let userInfo;
  try {
    const users = await cp.codeforces.getUser(handle);
    if (!users || users.length === 0) {
      return jsonError("NOT_FOUND", "Handle not found on Codeforces.");
    }
    userInfo = users[0];
  } catch (err: any) {
    if (err.message && err.message.toLowerCase().includes("not found")) {
      return jsonError("NOT_FOUND", "Handle not found on Codeforces.");
    }
    logger.warn("Codeforces verification lookup failed", {
      route: "POST /api/cp/verify-handle",
      operation: "fetch_codeforces_user",
      ...errorToLogMetadata(err),
    });
    return jsonError(
      "EXTERNAL_DEPENDENCY_FAILURE",
      "Failed to communicate with Codeforces API.",
    );
  }

  if (userInfo.firstName === cpUserDoc.cfVerificationToken) {
    cpUserDoc.cfVerified = true;
    cpUserDoc.cfVerificationToken = "";
    cpUserDoc.cfVerificationRequestedAt = null;
    await cpUserDoc.save();

    await User.findByIdAndUpdate(userId, { codeforcesId: handle });

    return jsonOk({
      success: true,
      message: "Codeforces handle verified successfully.",
    });
  } else {
    return jsonError(
      "VALIDATION_ERROR",
      `Token not found in CF profile. Make sure '${cpUserDoc.cfVerificationToken}' is in your First Name.`,
    );
  }
}

async function verifyAC(cpUserDoc: any, userId: string) {
  if (!cpUserDoc?.acVerificationToken || cpUserDoc.acVerified) {
    return jsonError("CONFLICT", "Already verified or no token found.");
  }

  const handle = cpUserDoc.acHandle;
  if (!handle) {
    return jsonError("VALIDATION_ERROR", "No handle pending verification.");
  }

  const redis = await getRedis();
  const redisKey = `ac:verify:lock:${userId}`;
  const isLocked = await redis.get(redisKey);
  if (isLocked) {
    const ttl = await redis.ttl(redisKey);
    return jsonError("RATE_LIMITED", `Try again in ${ttl} seconds`);
  }

  await redis.set(redisKey, "1", { EX: 60 });

  // AtCoder verification: check affiliation field
  const affiliation = await getUserAffiliation(handle);
  if (affiliation === null) {
    return jsonError(
      "EXTERNAL_DEPENDENCY_FAILURE",
      "Could not fetch AtCoder profile. Please try again.",
    );
  }

  if (affiliation === cpUserDoc.acVerificationToken) {
    cpUserDoc.acVerified = true;
    cpUserDoc.acVerificationToken = "";
    cpUserDoc.acVerificationRequestedAt = null;
    await cpUserDoc.save();

    await User.findByIdAndUpdate(userId, { atcoderId: handle });

    return jsonOk({
      success: true,
      message: "AtCoder handle verified successfully.",
    });
  } else {
    return jsonError(
      "VALIDATION_ERROR",
      `Token not found in AtCoder profile. Make sure '${cpUserDoc.acVerificationToken}' is set as your Affiliation.`,
    );
  }
}
