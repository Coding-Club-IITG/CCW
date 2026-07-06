import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";

    const query = includeArchived ? {} : { archived: { $ne: true } };
    const presets = await ContestPreset.find(query).sort({ name: 1 });

    return NextResponse.json(presets);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    if (!name || name.trim().length < 3) {
      return NextResponse.json(
        { error: "Name must be at least 3 characters long" },
        { status: 400 },
      );
    }

    // Check unique name
    const existing = await ContestPreset.findOne({ name: name.trim() });
    if (existing) {
      return NextResponse.json(
        { error: "Preset name already exists" },
        { status: 409 },
      );
    }

    const preset = await ContestPreset.create({
      name: name.trim(),
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
      archived: false,
    });

    return NextResponse.json(preset, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
