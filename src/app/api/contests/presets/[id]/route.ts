import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeContest } from "@/lib/audit/summary";
import { requireHead } from "@/lib/api/auth";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import {
  boundaryErrorResponse,
  jsonError,
  jsonOk,
} from "@/lib/api/result.server";
import {
  archiveContestPresetSchema,
  contestPresetParamsSchema,
  updateContestPresetSchema,
} from "@/lib/api/schemas/contestPreset";
import { toContestPresetDto } from "@/lib/contests/dtos";
import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";

type Context = { params: Promise<{ id: string }> };

async function validatedId(context: Context) {
  return parseRouteParams(await context.params, contestPresetParamsSchema);
}

export async function GET(request: NextRequest, context: Context) {
  const params = await validatedId(context);
  if (!params.ok) {
    return jsonError(params.error.code, params.error.message, {
      fields: params.error.fields,
    });
  }
  try {
    await dbConnect();
    const preset = await ContestPreset.findById(params.data.id).lean();
    return preset
      ? jsonOk(toContestPresetDto(preset))
      : jsonError("NOT_FOUND", "Preset not found");
  } catch (error) {
    return boundaryErrorResponse("get_contest_preset", error, request);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  const authorization = await requireHead(request);
  if (!authorization.ok) {
    return jsonError(authorization.error.code, authorization.error.message);
  }
  const params = await validatedId(context);
  if (!params.ok) {
    return jsonError(params.error.code, params.error.message, {
      fields: params.error.fields,
    });
  }
  const body = await parseJson(request, updateContestPresetSchema);
  if (!body.ok) {
    return jsonError(body.error.code, body.error.message, {
      fields: body.error.fields,
    });
  }

  try {
    await dbConnect();
    if (!(await ContestPreset.exists({ _id: params.data.id })))
      return jsonError("NOT_FOUND", "Preset not found");
    if (body.data.name) {
      const duplicate = await ContestPreset.exists({
        _id: { $ne: params.data.id },
        name: body.data.name,
      });
      if (duplicate) return jsonError("CONFLICT", "Preset name already exists");
    }
    const dbSession = await mongoose.startSession();
    let preset;
    try {
      preset = await auditedTransaction(dbSession, async (transaction) => {
        const before = await ContestPreset.findById(params.data.id)
          .session(transaction)
          .lean();
        if (!before)
          throw new Error("Contest preset disappeared during update.");
        const updated = await ContestPreset.findByIdAndUpdate(
          params.data.id,
          body.data,
          {
            returnDocument: "after",
            runValidators: true,
            session: transaction,
          },
        ).lean();
        if (!updated)
          throw new Error("Contest preset disappeared during update.");
        return {
          result: updated,
          audit: {
            actor: auditActor(authorization.data.user),
            category: "contests" as const,
            action: "update" as const,
            operation: "contests.preset.update",
            target: {
              type: "contest-preset",
              id: params.data.id,
              label: updated.name,
            },
            before: summarizeContest(
              before as unknown as Record<string, unknown>,
            ),
            after: summarizeContest(
              updated as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    return preset
      ? jsonOk(toContestPresetDto(preset))
      : jsonError("NOT_FOUND", "Preset not found");
  } catch (error) {
    return boundaryErrorResponse("update_contest_preset", error, request);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const authorization = await requireHead(request);
  if (!authorization.ok) {
    return jsonError(authorization.error.code, authorization.error.message);
  }
  const params = await validatedId(context);
  if (!params.ok) {
    return jsonError(params.error.code, params.error.message, {
      fields: params.error.fields,
    });
  }
  const body = await parseJson(request, archiveContestPresetSchema);
  if (!body.ok) {
    return jsonError(body.error.code, body.error.message, {
      fields: body.error.fields,
    });
  }

  try {
    await dbConnect();
    if (!(await ContestPreset.exists({ _id: params.data.id })))
      return jsonError("NOT_FOUND", "Preset not found");
    const dbSession = await mongoose.startSession();
    let preset;
    try {
      preset = await auditedTransaction(dbSession, async (transaction) => {
        const before = await ContestPreset.findById(params.data.id)
          .session(transaction)
          .lean();
        if (!before)
          throw new Error("Contest preset disappeared during archive update.");
        const updated = await ContestPreset.findByIdAndUpdate(
          params.data.id,
          body.data,
          {
            returnDocument: "after",
            runValidators: true,
            session: transaction,
          },
        ).lean();
        if (!updated)
          throw new Error("Contest preset disappeared during archive update.");
        return {
          result: updated,
          audit: {
            actor: auditActor(authorization.data.user),
            category: "contests" as const,
            action: "status_change" as const,
            operation: "contests.preset.archive",
            target: {
              type: "contest-preset",
              id: params.data.id,
              label: updated.name,
            },
            before: summarizeContest(
              before as unknown as Record<string, unknown>,
            ),
            after: summarizeContest(
              updated as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    return preset
      ? jsonOk(toContestPresetDto(preset))
      : jsonError("NOT_FOUND", "Preset not found");
  } catch (error) {
    return boundaryErrorResponse("archive_contest_preset", error, request);
  }
}
