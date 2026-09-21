import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";
import { toContestPresetDto } from "@/lib/contests/dtos";
import PresetManager from "@/components/contests/PresetManager";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isHead } from "@/lib/access/roles";
import { redirect } from "next/navigation";
import mongoose from "mongoose";

export const metadata = {
  title: "Contest Presets",
  description: "Manage your contest presets",
};

export default async function PresetsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth/login");
  }

  const isAdmin = isHead(session.user.access);

  await dbConnect();

  const filter: any = {};
  filter.$or = [
    { isGlobal: true },
    { creatorId: new mongoose.Types.ObjectId(session.user.id) },
  ];

  const presetsJson = await ContestPreset.find(filter).sort({ name: 1 }).lean();
  const presets = presetsJson.map(toContestPresetDto);

  return (
    <div style={{ padding: "2rem" }}>
      <h1
        style={{ fontSize: "2rem", marginBottom: "0.5rem", fontWeight: "bold" }}
      >
        Contest Presets
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Manage your reusable match settings and problem selections.
      </p>

      <PresetManager initialPresets={presets} isAdmin={isAdmin} />
    </div>
  );
}
