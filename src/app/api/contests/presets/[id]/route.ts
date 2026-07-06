import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";
import { requireAdmin } from "@/lib/requireAdmin";

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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
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
    const body = await request.json();
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
      problemSlots,
    } = body;

    const preset = await ContestPreset.findById(id);
    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    if (name && name.trim() !== preset.name) {
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
    if (problemSlots !== undefined) preset.problemSlots = problemSlots;

    await preset.save();
    return NextResponse.json(preset);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
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
    const body = await request.json();
    const { archived } = body;

    if (archived === undefined) {
      return NextResponse.json(
        { error: "Missing archived status" },
        { status: 400 },
      );
    }

    const preset = await ContestPreset.findByIdAndUpdate(
      id,
      { archived },
      { new: true },
    );

    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    return NextResponse.json(preset);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
