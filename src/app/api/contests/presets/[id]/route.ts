import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";
import { requireAdmin } from "@/lib/requireAdmin";
import { logger } from "@/lib/utils";

function errorMessage(error: unknown) {
  logger.error("[Contest Presets] Request failed:", error);
  return "Internal Server Error";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await dbConnect();
    const preset = await ContestPreset.findById(id);
    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }
    return NextResponse.json(preset);
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be an object" },
        { status: 400 },
      );
    }
    const {
      name,
      description,
      format,
      mode,
      durationSeconds,
      problemSelectionMode,
      bulkPlatform,
      bulkRatingMin,
      bulkRatingMax,
      bulkProblemCount,
      bulkMinContestId,
      problemSlots,
    } = body as Record<string, unknown>;

    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim().length < 3)
    ) {
      return NextResponse.json(
        { error: "Name must be at least 3 characters long" },
        { status: 400 },
      );
    }

    const preset = await ContestPreset.findById(id);
    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    if (typeof name === "string" && name.trim() !== preset.name) {
      const existing = await ContestPreset.findOne({ name: name.trim() });
      if (existing) {
        return NextResponse.json(
          { error: "Preset name already exists" },
          { status: 409 },
        );
      }
      preset.name = name.trim();
    }

    if (description !== undefined) preset.description = description;
    if (format !== undefined) preset.format = format;
    if (mode !== undefined) preset.mode = mode;
    if (durationSeconds !== undefined) preset.durationSeconds = durationSeconds;
    if (problemSelectionMode !== undefined)
      preset.problemSelectionMode = problemSelectionMode;
    if (bulkPlatform !== undefined) preset.bulkPlatform = bulkPlatform;
    if (bulkRatingMin !== undefined) preset.bulkRatingMin = bulkRatingMin;
    if (bulkRatingMax !== undefined) preset.bulkRatingMax = bulkRatingMax;
    if (bulkProblemCount !== undefined)
      preset.bulkProblemCount = bulkProblemCount;
    if (bulkMinContestId !== undefined)
      preset.bulkMinContestId = bulkMinContestId;
    if (problemSlots !== undefined) preset.problemSlots = problemSlots;

    await preset.save();
    return NextResponse.json(preset);
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();
    const body: unknown = await request.json();
    const archived =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).archived
        : undefined;

    if (typeof archived !== "boolean") {
      return NextResponse.json(
        { error: "archived must be a boolean" },
        { status: 400 },
      );
    }

    const preset = await ContestPreset.findByIdAndUpdate(
      id,
      { archived },
      { new: true, runValidators: true },
    );

    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    return NextResponse.json(preset);
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
