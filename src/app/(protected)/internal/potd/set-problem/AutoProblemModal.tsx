"use client";

import { useState } from "react";
import styles from "./AutoProblemModal.module.scss";
import { DifficultyBadge } from "@/components/shared/DifficultyBadge";
import { CandidateProblemCard } from "./CandidateProblemCard";
import { X, Sparkles, Play, Save, ArrowLeft } from "lucide-react";
import {
  type Difficulty,
  DIFFICULTIES,
  PLATFORM_PROBLEM_URLS,
  CF_CONTEST_YEAR_OPTIONS,
} from "@/lib/constants";
import { formatDate, getTodayISTDateStr } from "@/lib/potd/utils";
import {
  autoFetchPOTDCandidates,
  bulkSetDailyProblems,
  type POTDCandidateResult,
  type POTDAutoSlotConfig,
} from "@/lib/actions/admin/potd";

interface AutoProblemModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableDates: string[];
  takenDifficultiesMap: (dateStr: string) => Set<Difficulty>;
  onSuccess: () => void;
}

type RatingRange = {
  min: number;
  max: number;
};

export default function AutoProblemModal({
  isOpen,
  onClose,
  availableDates,
  takenDifficultiesMap,
  onSuccess,
}: AutoProblemModalProps) {
  const todayIST = getTodayISTDateStr();

  // Step 1 or 2
  const [step, setStep] = useState<"config" | "preview">("config");

  // Selected dates -> Array of dates
  const [selectedDates, setSelectedDates] = useState<string[]>(() => {
    // Default to first open date or today
    return availableDates.slice(0, 3);
  });

  // Selected difficulty slots per date: { [dateStr]: Set<Difficulty> }
  const [dateSlots, setDateSlots] = useState<Record<string, Difficulty[]>>(
    () => {
      const initial: Record<string, Difficulty[]> = {};
      availableDates.forEach((d) => {
        const taken = takenDifficultiesMap(d);
        initial[d] = DIFFICULTIES.filter((diff) => !taken.has(diff));
      });
      return initial;
    },
  );

  // Rating parameters per difficulty
  const [ratingRanges, setRatingRanges] = useState<
    Record<Difficulty, RatingRange>
  >({
    Easy: { min: 800, max: 1200 },
    Medium: { min: 1300, max: 1600 },
    Hard: { min: 1700, max: 2100 },
  });

  // Minimum contest ID threshold
  const [minContestId, setMinContestId] = useState<number>(0);

  // Generated candidates list
  const [candidates, setCandidates] = useState<POTDCandidateResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [rerollingId, setRerollingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleToggleDate = (d: string) => {
    if (selectedDates.includes(d)) {
      setSelectedDates(selectedDates.filter((date) => date !== d));
    } else {
      setSelectedDates([...selectedDates, d]);
    }
  };

  const handleToggleDifficulty = (d: string, diff: Difficulty) => {
    const current = dateSlots[d] || [];
    if (current.includes(diff)) {
      setDateSlots({
        ...dateSlots,
        [d]: current.filter((item) => item !== diff),
      });
    } else {
      setDateSlots({ ...dateSlots, [d]: [...current, diff] });
    }
  };

  const handleGeneratePreview = async () => {
    setErrorMsg(null);
    const slotsToFetch: POTDAutoSlotConfig[] = [];

    selectedDates.forEach((dateStr) => {
      const diffs = dateSlots[dateStr] || [];
      diffs.forEach((diff) => {
        slotsToFetch.push({
          id: `${dateStr}-${diff}`,
          dateStr,
          difficulty: diff,
          ratingMin: ratingRanges[diff].min,
          ratingMax: ratingRanges[diff].max,
          minContestId,
        });
      });
    });

    if (slotsToFetch.length === 0) {
      setErrorMsg(
        "Please select at least one date and difficulty slot to auto-set.",
      );
      return;
    }

    setLoading(true);
    try {
      const res = await autoFetchPOTDCandidates(slotsToFetch);
      if (!res.ok || !res.candidates) {
        setErrorMsg(res.error || "Failed to fetch candidate problems.");
        return;
      }
      setCandidates(res.candidates);
      setStep("preview");
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleRerollSingle = async (candidateId: string) => {
    const target = candidates.find((c) => c.id === candidateId);
    if (!target) return;

    setRerollingId(candidateId);

    // Exclude problems currently assigned in other slots of this preview session
    const otherPickedProblemIds = candidates
      .filter((c) => c.id !== candidateId && c.problem?.problemId)
      .map((c) => c.problem!.problemId);

    try {
      const singleSlotConfig: POTDAutoSlotConfig = {
        id: target.id,
        dateStr: target.dateStr,
        difficulty: target.difficulty,
        ratingMin: target.ratingMin,
        ratingMax: target.ratingMax,
        minContestId,
      };

      const res = await autoFetchPOTDCandidates(
        [singleSlotConfig],
        otherPickedProblemIds,
      );

      if (res.ok && res.candidates && res.candidates.length > 0) {
        const newCand = res.candidates[0];
        setCandidates((prev) =>
          prev.map((item) => (item.id === candidateId ? newCand : item)),
        );
      }
    } finally {
      setRerollingId(null);
    }
  };

  const handleSaveAll = async () => {
    const validItems = candidates
      .filter((c) => c.problem !== null)
      .map((c) => ({
        dateStr: c.dateStr,
        difficulty: c.difficulty,
        problemId: c.problem!.problemId,
        platform: "codeforces" as const,
      }));

    if (validItems.length === 0) {
      setErrorMsg("No valid problem candidates selected to save.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await bulkSetDailyProblems(validItems);
      if (!res.ok) {
        setErrorMsg(res.error || "Failed to save scheduled problems.");
        return;
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Error saving scheduled problems.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2>
            <Sparkles size={18} />
            Auto Problem Setting
          </h2>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {errorMsg && <div className={styles.errorMessage}>{errorMsg}</div>}

          {step === "config" ? (
            <>
              {/* Rating Parameters per Difficulty */}
              <div>
                <div className={styles.sectionTitle}>
                  1. Rating Parameters per Difficulty
                </div>
                <div className={styles.ratingsContainer}>
                  {DIFFICULTIES.map((diff) => (
                    <div key={diff} className={styles.ratingGroup}>
                      <div className={styles.ratingGroupHeader}>
                        <DifficultyBadge difficulty={diff} />
                        <span
                          style={{ fontSize: "0.75rem", color: "var(--muted)" }}
                        >
                          Rating Bounds
                        </span>
                      </div>
                      <div className={styles.inputsRow}>
                        <input
                          type="number"
                          title={`${diff} Minimum Rating`}
                          value={ratingRanges[diff].min}
                          onChange={(e) =>
                            setRatingRanges({
                              ...ratingRanges,
                              [diff]: {
                                ...ratingRanges[diff],
                                min: Math.max(0, parseInt(e.target.value) || 0),
                              },
                            })
                          }
                          step={100}
                        />
                        <span>to</span>
                        <input
                          type="number"
                          title={`${diff} Maximum Rating`}
                          value={ratingRanges[diff].max}
                          onChange={(e) =>
                            setRatingRanges({
                              ...ratingRanges,
                              [diff]: {
                                ...ratingRanges[diff],
                                max: Math.max(0, parseInt(e.target.value) || 0),
                              },
                            })
                          }
                          step={100}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Release Timeframe / Contest Filter */}
              <div>
                <div className={styles.sectionTitle}>
                  2. Release Timeframe / Contest Filter
                </div>
                <div
                  className={styles.ratingsContainer}
                  style={{ gridTemplateColumns: "1fr" }}
                >
                  <div className={styles.ratingGroup}>
                    <label
                      htmlFor="potdMinContestSelect"
                      style={{ fontSize: "0.8125rem", fontWeight: 600 }}
                    >
                      Contest Release Date
                    </label>
                    <select
                      id="potdMinContestSelect"
                      value={minContestId}
                      onChange={(e) => setMinContestId(Number(e.target.value))}
                      style={{
                        padding: "0.5rem 0.75rem",
                        border: "1px solid var(--border-input)",
                        borderRadius: "6px",
                        fontSize: "0.875rem",
                        background: "var(--surface)",
                        color: "var(--foreground)",
                        outline: "none",
                      }}
                    >
                      {CF_CONTEST_YEAR_OPTIONS.map((opt) => (
                        <option key={opt.minContestId} value={opt.minContestId}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Select Dates and Slots */}
              <div>
                <div className={styles.sectionTitle}>
                  2. Select Target Dates & Difficulty Slots
                </div>
                <div className={styles.datesGrid}>
                  {availableDates.map((dateStr) => {
                    const isToday = dateStr === todayIST;
                    const taken = takenDifficultiesMap(dateStr);
                    const isSelectedDate = selectedDates.includes(dateStr);
                    const activeDiffs = dateSlots[dateStr] || [];

                    return (
                      <div key={dateStr} className={styles.dateCard}>
                        <div className={styles.dateCardHeader}>
                          <label className={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={isSelectedDate}
                              onChange={() => handleToggleDate(dateStr)}
                            />
                            <span>
                              {isToday ? "Today" : formatDate(dateStr, "short")}
                            </span>
                          </label>
                          {taken.size > 0 && (
                            <span
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--muted)",
                              }}
                            >
                              ({taken.size}/3 taken)
                            </span>
                          )}
                        </div>

                        <div className={styles.diffCheckboxes}>
                          {DIFFICULTIES.map((diff) => {
                            const isTaken = taken.has(diff);
                            const isChecked =
                              isSelectedDate && activeDiffs.includes(diff);

                            return (
                              <label
                                key={diff}
                                className={`${styles.checkboxLabel} ${
                                  isTaken ? styles.disabled : ""
                                }`}
                                title={
                                  isTaken
                                    ? "Already set for this date"
                                    : undefined
                                }
                              >
                                <input
                                  type="checkbox"
                                  disabled={isTaken || !isSelectedDate}
                                  checked={isChecked && !isTaken}
                                  onChange={() =>
                                    handleToggleDifficulty(dateStr, diff)
                                  }
                                />
                                <span>{diff}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Step 2: Interactive Candidate Preview */
            <div>
              <div className={styles.sectionTitle}>
                Candidate Problems Preview ({candidates.length} slots)
              </div>
              <div className={styles.previewGrid}>
                {candidates.map((item) => (
                  <CandidateProblemCard
                    key={item.id}
                    item={item}
                    isToday={item.dateStr === todayIST}
                    isRerolling={rerollingId === item.id}
                    saving={saving}
                    onReroll={handleRerollSingle}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={styles.footer}>
          {step === "config" ? (
            <>
              <button className={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                className={styles.primaryBtn}
                disabled={loading}
                onClick={handleGeneratePreview}
              >
                <Play size={16} />
                {loading
                  ? "Generating Candidate Preview..."
                  : "Generate Preview"}
              </button>
            </>
          ) : (
            <>
              <button
                className={styles.cancelBtn}
                onClick={() => setStep("config")}
                disabled={saving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                }}
              >
                <ArrowLeft size={16} />
                Back to Config
              </button>
              <button
                className={styles.primaryBtn}
                disabled={saving || candidates.every((c) => !c.problem)}
                onClick={handleSaveAll}
              >
                <Save size={16} />
                {saving ? "Saving Schedule..." : "Confirm & Save Schedule"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
