import { headers } from "next/headers";
import { redirect } from "next/navigation";
import mongoose from "mongoose";

import { connectMongoDB } from "@/lib/db/mongodb";
import { toContestPresetDto } from "@/lib/contests/dtos";
import { auth } from "@/lib/auth/server";
import { isHead } from "@/lib/access/roles";

import ContestPreset from "@/models/ContestPreset";

import BackLink from "@/components/shared/BackLink";
import PresetManager from "@/components/contests/PresetManager";

import styles from "./page.module.scss";

export default async function PresetsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/auth/login");
  }

  const isAdmin = isHead(session.user.access);

  await connectMongoDB();

  const filter = {
    $or: [
      { isGlobal: true },
      { creatorId: new mongoose.Types.ObjectId(session.user.id) },
    ],
  };

  const presetsJson = await ContestPreset.find(filter).sort({ name: 1 }).lean();
  const presets = presetsJson.map(toContestPresetDto);

  return (
    <main className={styles.page}>
      <BackLink href="/internal/contests" label="Back to Contests" />
      <header className={styles.header}>
        <h1>Contest Presets</h1>
        <p>Manage your reusable match settings and problem selections.</p>
      </header>

      <PresetManager initialPresets={presets} isAdmin={isAdmin} />
    </main>
  );
}
