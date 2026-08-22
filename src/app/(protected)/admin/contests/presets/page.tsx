import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";
import { toContestPresetDto } from "@/lib/contests/dtos";
import PresetManager from "@/components/admin/contests/PresetManager";
import BackLink from "@/components/shared/BackLink";
import styles from "./presets.module.scss";

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
    <div className={styles.pageContainer}>
      <BackLink href="/admin" label="Back to Administration" />

      <header className={styles.header}>
        <h1>Contest Presets</h1>
        <p>Manage reusable match settings and problem selections.</p>
      </header>

      <PresetManager initialPresets={presets} />
    </div>
  );
}
