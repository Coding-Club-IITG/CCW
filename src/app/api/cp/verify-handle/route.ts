import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import { dbConnect } from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";
import { getUserAffiliation } from "@/lib/platforms/atcoder";

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Determine platform from query param
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform") || "codeforces";

    await dbConnect();

    const cpUserDoc = await CPUser.findOne({ userId: session.user.id });

    if (platform === "codeforces") {
      return verifyCF(cpUserDoc, session.user.id);
    } else if (platform === "atcoder") {
      return verifyAC(cpUserDoc, session.user.id);
    }

    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function verifyCF(cpUserDoc: any, userId: string) {
  if (!cpUserDoc?.cfVerificationToken || cpUserDoc.cfVerified) {
    return NextResponse.json(
      { error: "Already verified or no token found." },
      { status: 400 },
    );
  }

  const handle = cpUserDoc.cfHandle;
  if (!handle) {
    return NextResponse.json(
      { error: "No handle pending verification." },
      { status: 400 },
    );
  }

  const redis = await getRedis();
  const redisKey = `cf:verify:lock:${userId}`;
  const isLocked = await redis.get(redisKey);
  if (isLocked) {
    const ttl = await redis.ttl(redisKey);
    return NextResponse.json(
      { error: `Try again in ${ttl} seconds` },
      { status: 429 },
    );
  }

  const globalCfLimitKey = `cf:api:global_lock`;
  const cfLocked = await redis.set(globalCfLimitKey, "1", {
    NX: true,
    EX: 2,
  });
  if (!cfLocked) {
    return NextResponse.json(
      { error: "Codeforces is busy, please try again in a few seconds." },
      { status: 429 },
    );
  }

  await redis.set(redisKey, "1", { EX: 60 });

  const cfRes = await fetch(
    `https://codeforces.com/api/user.info?handles=${handle}`,
  );
  if (!cfRes.ok) {
    return NextResponse.json(
      { error: "Failed to communicate with Codeforces API." },
      { status: 502 },
    );
  }
  const cfData = await cfRes.json();

  if (
    cfData.status !== "OK" ||
    !cfData.result ||
    cfData.result.length === 0
  ) {
    return NextResponse.json(
      { error: "Handle not found on Codeforces." },
      { status: 404 },
    );
  }

  if (cfData.result[0].firstName === cpUserDoc.cfVerificationToken) {
    cpUserDoc.cfVerified = true;
    cpUserDoc.cfVerificationToken = "";
    cpUserDoc.cfVerificationRequestedAt = null;
    await cpUserDoc.save();

    await User.findByIdAndUpdate(userId, { codeforcesId: handle });

    return NextResponse.json({
      success: true,
      message: "Codeforces handle verified successfully.",
    });
  } else {
    return NextResponse.json(
      {
        error: `Token not found in CF profile. Make sure '${cpUserDoc.cfVerificationToken}' is in your First Name.`,
      },
      { status: 400 },
    );
  }
}

async function verifyAC(cpUserDoc: any, userId: string) {
  if (!cpUserDoc?.acVerificationToken || cpUserDoc.acVerified) {
    return NextResponse.json(
      { error: "Already verified or no token found." },
      { status: 400 },
    );
  }

  const handle = cpUserDoc.acHandle;
  if (!handle) {
    return NextResponse.json(
      { error: "No handle pending verification." },
      { status: 400 },
    );
  }

  const redis = await getRedis();
  const redisKey = `ac:verify:lock:${userId}`;
  const isLocked = await redis.get(redisKey);
  if (isLocked) {
    const ttl = await redis.ttl(redisKey);
    return NextResponse.json(
      { error: `Try again in ${ttl} seconds` },
      { status: 429 },
    );
  }

  await redis.set(redisKey, "1", { EX: 60 });

  // AtCoder verification: check affiliation field
  const affiliation = await getUserAffiliation(handle);
  if (affiliation === null) {
    return NextResponse.json(
      { error: "Could not fetch AtCoder profile. Please try again." },
      { status: 502 },
    );
  }

  if (affiliation === cpUserDoc.acVerificationToken) {
    cpUserDoc.acVerified = true;
    cpUserDoc.acVerificationToken = "";
    cpUserDoc.acVerificationRequestedAt = null;
    await cpUserDoc.save();

    await User.findByIdAndUpdate(userId, { atcoderId: handle });

    return NextResponse.json({
      success: true,
      message: "AtCoder handle verified successfully.",
    });
  } else {
    return NextResponse.json(
      {
        error: `Token not found in AtCoder profile. Make sure '${cpUserDoc.acVerificationToken}' is set as your Affiliation.`,
      },
      { status: 400 },
    );
  }
}
