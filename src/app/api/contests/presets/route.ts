import { NextRequest } from "next/server";

import { requireHead } from "@/lib/api/auth";
import { parseJson, parseSearchParams } from "@/lib/api/result";
import {
  boundaryErrorResponse,
  jsonError,
  jsonOk,
} from "@/lib/api/result.server";
import {
  contestPresetQuerySchema,
  createContestPresetSchema,
} from "@/lib/api/schemas/contestPreset";
import { toContestPresetDto } from "@/lib/contests/dtos";
import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";

export async function GET(request: NextRequest) {
  const query = parseSearchParams(
    request.nextUrl.searchParams,
    contestPresetQuerySchema,
  );
  if (!query.ok) {
    return jsonError(query.error.code, query.error.message, {
      fields: query.error.fields,
    });
  }

  try {
    await dbConnect();
    const filter = query.data.includeArchived
      ? {}
      : { archived: { $ne: true } };
    const presets = await ContestPreset.find(filter).sort({ name: 1 }).lean();
    return jsonOk(presets.map(toContestPresetDto));
  } catch (error) {
    return boundaryErrorResponse("list_contest_presets", error, request);
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireHead(request);
  if (!authorization.ok) {
    return jsonError(authorization.error.code, authorization.error.message);
  }
  const body = await parseJson(request, createContestPresetSchema);
  if (!body.ok) {
    return jsonError(body.error.code, body.error.message, {
      fields: body.error.fields,
    });
  }

  try {
    await dbConnect();
    const existing = await ContestPreset.exists({ name: body.data.name });
    if (existing) {
      return jsonError("CONFLICT", "Preset name already exists");
    }
    const preset = await ContestPreset.create({
      ...body.data,
      archived: false,
    });
    return jsonOk(toContestPresetDto(preset), { status: 201 });
  } catch (error) {
    return boundaryErrorResponse("create_contest_preset", error, request);
  }
}
