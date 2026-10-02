import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { auth } from "@/lib/auth/server";
import { connectMongoDB } from "@/lib/db/mongodb";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import { contestIdParamsSchema } from "@/lib/api/schemas/contestRoute";
import { contestTeamRegistrationSchema } from "@/lib/api/schemas/contestRegistration";
import {
  registerContestMember,
  registerCompleteContestTeam,
} from "@/lib/contests/registration";

import ContestMatch from "@/models/ContestMatch";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) return jsonError("UNAUTHENTICATED", "Unauthorized");

    const validated = parseRouteParams(await params, contestIdParamsSchema);

    if (!validated.ok) return jsonResult(validated);

    const id = validated.data.id.toLowerCase();

    await connectMongoDB();

    const contest = await ContestMatch.findById(id, "teamSize").lean();

    if (!contest) return jsonError("NOT_FOUND", "Contest not found");

    if ((contest.teamSize ?? 1) === 1) {
      const result = await registerContestMember(session.user.id, {
        contestId: id,
      });

      if (!result.ok) return jsonResult(result);
    } else {
      const body = await parseJson(request, contestTeamRegistrationSchema);

      if (!body.ok) return jsonResult(body);

      const result = await registerCompleteContestTeam(
        session.user.id,
        id,
        body.data,
      );

      if (!result.ok) return jsonResult(result);
    }

    revalidatePath("/internal/contests");

    return jsonOk({ registered: true });
  } catch (error) {
    logger.error("Contest registration failed", {
      route: "POST /api/contests/[id]/register",
      operation: "register",
      ...errorToLogMetadata(error),
    });

    return jsonError(
      "INTERNAL_ERROR",
      "Unable to complete contest registration.",
    );
  }
}
