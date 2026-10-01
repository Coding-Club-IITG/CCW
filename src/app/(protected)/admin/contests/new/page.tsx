import { connectMongoDB } from "@/lib/db/mongodb";
import { toContestPresetDto } from "@/lib/contests/dtos";

import ContestPreset from "@/models/ContestPreset";

import ContestWizard from "@/components/admin/contests/ContestWizard";

export const metadata = {
  title: "CCW Admin - New Tournament",
  description: "Create a new knockout tournament",
};

export default async function NewContestPage() {
  await connectMongoDB();
  // Fetch active (non-archived) presets
  const presetsJson = await ContestPreset.find({ archived: { $ne: true } })
    .sort({ name: 1 })
    .lean();

  const presets = presetsJson.map(toContestPresetDto);

  return (
    <div>
      <ContestWizard presets={presets} />
    </div>
  );
}
