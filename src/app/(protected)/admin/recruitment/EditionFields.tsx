"use client";

import { useId } from "react";

import {
  RECRUITMENT_MAX_YEAR,
  RECRUITMENT_MIN_YEAR,
  RECRUITMENT_SEASONS,
  type RecruitmentSeason,
} from "@/lib/constants";

import styles from "./Recruitment.module.scss";

export default function EditionFields({
  year,
  season,
  disabled,
  onYearChange,
  onSeasonChange,
}: {
  year: number;
  season: RecruitmentSeason;
  disabled: boolean;
  onYearChange: (year: number) => void;
  onSeasonChange: (season: RecruitmentSeason) => void;
}) {
  const id = useId();
  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${id}-year`}>Year</label>
        <input
          id={`${id}-year`}
          type="number"
          min={RECRUITMENT_MIN_YEAR}
          max={RECRUITMENT_MAX_YEAR}
          required
          value={year}
          disabled={disabled}
          onChange={(event) => onYearChange(Number(event.target.value))}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-season`}>Season</label>
        <select
          id={`${id}-season`}
          value={season}
          disabled={disabled}
          onChange={(event) =>
            onSeasonChange(event.target.value as RecruitmentSeason)
          }
        >
          {RECRUITMENT_SEASONS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
    </>
  );
}
