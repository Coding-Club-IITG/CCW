import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";
import { toContestPresetDto } from "@/lib/contests/dtos";
import PresetManager from "@/components/admin/contests/PresetManager";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

export const metadata = {
  title: "CCW Admin - Contest Presets",
  description: "Manage contest presets",
};

export default async function PresetsPage() {
  await dbConnect();
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
