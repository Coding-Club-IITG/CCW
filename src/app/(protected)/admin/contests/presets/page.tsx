import { connectMongoDB } from "@/lib/db/mongodb";
import { toContestPresetDto } from "@/lib/contests/dtos";

import ContestPreset from "@/models/ContestPreset";

import PresetManager from "@/components/admin/contests/PresetManager";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

export const metadata = {
  title: "CCW Admin - Contest Presets",
  description: "Manage contest presets",
};

export default async function PresetsPage() {
  await connectMongoDB();
  // Fetch initial presets server-side
  const presetsJson = await ContestPreset.find().sort({ name: 1 }).lean();

  // Serialize Mongo _id and Dates
  const presets = presetsJson.map(toContestPresetDto);

  return (
    <div>
      <AdminPageHeader
        title="Contest Presets"
        lead="Manage reusable match settings and problem selections."
      />

      <PresetManager initialPresets={presets} />
    </div>
  );
}
