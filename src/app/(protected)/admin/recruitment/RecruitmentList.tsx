"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { appErrorMessage, expectAppData } from "@/lib/api/result";
import type { RecruitmentSeason } from "@/lib/constants";
import type { RecruitmentDto } from "@/lib/recruitment";

import EmptyState from "@/components/shared/EmptyState";
import InlineNotice from "@/components/shared/InlineNotice";

import EditionFields from "./EditionFields";
import styles from "./Recruitment.module.scss";

export default function RecruitmentList({
  editions,
}: {
  editions: RecruitmentDto[];
}) {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear());
  const [season, setSeason] = useState<RecruitmentSeason>("Winter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <form
        className={styles.editionForm}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const edition = await expectAppData<RecruitmentDto>(
              await fetch("/api/admin/recruitment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ year, season }),
              }),
            );
            router.push(`/admin/recruitment/${edition._id}`);
          } catch (error) {
            setError(appErrorMessage(error, "Could not create the edition."));
            setBusy(false);
          }
        }}
      >
        <EditionFields
          year={year}
          season={season}
          disabled={busy}
          onYearChange={setYear}
          onSeasonChange={setSeason}
        />
        <button className={styles.primary} disabled={busy}>
          {busy ? "Creating…" : "Create draft edition"}
        </button>
      </form>
      {error && (
        <div className={styles.feedback}>
          <InlineNotice tone="error">{error}</InlineNotice>
        </div>
      )}
      <div className={styles.editionList}>
        {editions.map((edition) => (
          <Link
            key={edition._id}
            href={`/admin/recruitment/${edition._id}`}
            className={styles.editionCard}
          >
            <span>
              <strong>{edition.label}</strong>
              <span className={styles.hint}>
                {edition.modules.reduce(
                  (total, module) =>
                    total +
                    Number(!!module.resources.document) +
                    Number(!!module.task.document),
                  0,
                )}{" "}
                / 10 PDFs uploaded
              </span>
            </span>
            <span className={styles.badge}>{edition.status}</span>
          </Link>
        ))}
      </div>
      {!editions.length && (
        <EmptyState
          title="No recruitment editions yet."
          hint="Create a draft and add dates and PDFs whenever they are ready."
        />
      )}
    </>
  );
}
