import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";
import PresetManager from "@/components/admin/contests/PresetManager";
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
  const presets = JSON.parse(JSON.stringify(presetsJson));

  return (
    <div className={styles.pageContainer}>
      <h1 className={styles.title}>Contest Presets</h1>
      <PresetManager initialPresets={presets} />
    </div>
  );
}
