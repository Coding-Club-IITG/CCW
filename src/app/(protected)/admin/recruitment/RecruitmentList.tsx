"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { appErrorMessage, expectAppData } from "@/lib/api/result";
import { RECRUITMENT_SEASONS, type RecruitmentSeason } from "@/lib/constants";
import type { RecruitmentDto } from "@/lib/recruitment";

import EmptyState from "@/components/shared/EmptyState";

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
        <div className={styles.field}>
          <label htmlFor="new-edition-year">Year</label>
          <input
            id="new-edition-year"
            type="number"
            min={2000}
            max={2200}
            required
            value={year}
            disabled={busy}
            onChange={(event) => setYear(Number(event.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="new-edition-season">Season</label>
          <select
            id="new-edition-season"
            value={season}
            disabled={busy}
            onChange={(event) =>
              setSeason(event.target.value as RecruitmentSeason)
            }
          >
            {RECRUITMENT_SEASONS.map((season) => (
              <option key={season}>{season}</option>
            ))}
          </select>
        </div>
        <button className={styles.primary} disabled={busy}>
          {busy ? "Creating…" : "Create draft edition"}
        </button>
      </form>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
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
