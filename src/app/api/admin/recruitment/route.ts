import { NextRequest } from "next/server";

import { requireHead } from "@/lib/api/auth";
import { parseJson } from "@/lib/api/result";
import { jsonOk, jsonResult } from "@/lib/api/result.server";
import { createRecruitmentSchema } from "@/lib/api/schemas/recruitment";
import { serializeRecruitment } from "@/lib/recruitment";
import {
  getAdminRecruitments,
  invalidateRecruitment,
  mutateRecruitment,
  recruitmentError,
} from "@/lib/recruitment.server";
import Recruitment from "@/models/Recruitment";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    return jsonOk(await getAdminRecruitments());
  } catch (error) {
    return recruitmentError(error, "recruitment.list", request);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const parsed = await parseJson(request, createRecruitmentSchema);
    if (!parsed.ok) return jsonResult(parsed);
    const result = await mutateRecruitment(
      authorization.data.user,
      "create",
      "create",
      async (session) => {
        const [edition] = await Recruitment.create(
          [{ ...parsed.data, createdBy: authorization.data.user.id }],
          { session },
        );
        return { edition, result: serializeRecruitment(edition, "admin") };
      },
    );
    await invalidateRecruitment();
    return jsonOk(result, { status: 201 });
  } catch (error) {
    return recruitmentError(error, "recruitment.create", request);
  }
}
