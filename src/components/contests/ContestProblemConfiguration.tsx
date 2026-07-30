"use client";

import { Lock } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import type { ContestCreationForm } from "@/components/contests/contestCreationForm";
import { CF_CONTEST_YEAR_OPTIONS } from "@/lib/constants";

import styles from "./CreateRoomModal.module.scss";

export interface BracketRoundProblems {
  roundNumber: number;
  problemIds: string[];
}

interface Props {
  form: ContestCreationForm;
  setForm: Dispatch<SetStateAction<ContestCreationForm>>;
  presetLocked: boolean;
  fineTunedCountError: string;
  setFineTunedCountError: Dispatch<SetStateAction<string>>;
  bracketRoundProblems: BracketRoundProblems[];
  setBracketRoundProblems: Dispatch<SetStateAction<BracketRoundProblems[]>>;
}

export default function ContestProblemConfiguration({
  form,
  setForm,
  presetLocked,
  fineTunedCountError,
  setFineTunedCountError,
  bracketRoundProblems,
  setBracketRoundProblems,
}: Props) {
  const updateForm = (updates: Partial<ContestCreationForm>) => {
    setForm((current) => ({ ...current, ...updates }));
  };

  const bracketParticipantCount = Math.max(2, form.maxParticipants || 2);
  const bracketRoundCount = Math.ceil(Math.log2(bracketParticipantCount));
  const problemsPerMatch = form.bulkProblemCount || 3;

  const syncedBracketRounds: BracketRoundProblems[] = [];
  if (form.problemSelectionMode === "fine-tuned" && form.format === "bracket") {
    for (let roundNumber = 1; roundNumber <= bracketRoundCount; roundNumber++) {
      const matchCount = Math.pow(2, bracketRoundCount - roundNumber);
      const requiredProblemCount = matchCount * problemsPerMatch;
      const existing = bracketRoundProblems.find(
        (round) => round.roundNumber === roundNumber,
      );
      const problemIds = existing ? [...existing.problemIds] : [];
      while (problemIds.length < requiredProblemCount) problemIds.push("");
      while (problemIds.length > requiredProblemCount) problemIds.pop();
      syncedBracketRounds.push({ roundNumber, problemIds });
    }

    if (
      JSON.stringify(syncedBracketRounds) !==
      JSON.stringify(bracketRoundProblems)
    ) {
      setTimeout(() => setBracketRoundProblems(syncedBracketRounds), 0);
    }
  }

  const getRoundLabel = (roundNumber: number) => {
    if (roundNumber === bracketRoundCount) return "Final";
    if (roundNumber === bracketRoundCount - 1) return "Semi-Finals";
    if (roundNumber === bracketRoundCount - 2) return "Quarter-Finals";
    return `Round ${roundNumber}`;
  };

  return (
    <div
      className={`${styles.sectionBlock} ${presetLocked ? styles.locked : ""}`}
    >
      <div className={styles.sectionTitleRow}>
        <h3 className={styles.sectionHeading}>Problem Configuration</h3>
        {presetLocked && (
          <Lock
            className={`${styles.lockIcon} ${styles.iconFilled}`}
            size={18}
          />
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="problem-selection-mode">
          Selection Mode
        </label>
        <select
          id="problem-selection-mode"
          value={form.problemSelectionMode}
          onChange={(event) =>
            updateForm({ problemSelectionMode: event.target.value })
          }
          disabled={presetLocked}
          className={`${styles.formInput} ${styles.formSelect}`}
        >
          <option value="test">Test</option>
          <option value="bulk">Bulk</option>
          <option value="fine-tuned">Fine-Tuned</option>
        </select>
        {form.problemSelectionMode === "test" && (
          <span className={styles.hint}>
            A pre-selected test problem will be assigned to verify the room
            mechanics.
          </span>
        )}
        {form.problemSelectionMode === "bulk" && (
          <span className={styles.hint}>
            Automatically fetch problems unsolved by all registered players,
            selected based on their rating range.
          </span>
        )}
        {form.problemSelectionMode === "fine-tuned" && (
          <span className={styles.hint}>
            Manually curate and select exactly which problems will be included
            in the room.
          </span>
        )}
      </div>

      {form.problemSelectionMode === "bulk" && (
        <div className={styles.grid3}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="min-rating">
              Min Rating
            </label>
            <input
              required
              id="min-rating"
              type="number"
              step={100}
              value={Number.isNaN(form.bulkRatingMin) ? "" : form.bulkRatingMin}
              onChange={(event) =>
                updateForm({ bulkRatingMin: parseInt(event.target.value) })
              }
              disabled={presetLocked}
              className={styles.formInput}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="max-rating">
              Max Rating
            </label>
            <input
              required
              id="max-rating"
              type="number"
              step={100}
              value={Number.isNaN(form.bulkRatingMax) ? "" : form.bulkRatingMax}
              onChange={(event) =>
                updateForm({ bulkRatingMax: parseInt(event.target.value) })
              }
              disabled={presetLocked}
              className={styles.formInput}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="problem-count">
              Count
            </label>
            <input
              required
              id="problem-count"
              type="number"
              min={1}
              max={10}
              value={
                Number.isNaN(form.bulkProblemCount) ? "" : form.bulkProblemCount
              }
              onChange={(event) =>
                updateForm({ bulkProblemCount: parseInt(event.target.value) })
              }
              disabled={presetLocked}
              className={styles.formInput}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="bulk-min-contest">
              Contest Release Date
            </label>
            <select
              id="bulk-min-contest"
              value={form.bulkMinContestId}
              onChange={(event) =>
                updateForm({ bulkMinContestId: Number(event.target.value) })
              }
              disabled={presetLocked}
              className={styles.formInput}
            >
              {CF_CONTEST_YEAR_OPTIONS.map((option) => (
                <option key={option.minContestId} value={option.minContestId}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {form.problemSelectionMode === "fine-tuned" &&
        form.format !== "bracket" && (
          <div className={styles.fineTunedBlock}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="fine-tuned-count">
                Number of Problems
              </label>
              <input
                required
                id="fine-tuned-count"
                type="number"
                min={1}
                max={10}
                value={form.fineTunedProblemCount}
                onChange={(event) => {
                  const value = event.target.value;
                  const validInteger = /^[1-9]\d*$/.test(value);
                  const count = parseInt(value, 10);

                  if (validInteger && count >= 1 && count <= 10) {
                    setFineTunedCountError("");
                    const fineTunedProblems = [...form.fineTunedProblems];
                    while (fineTunedProblems.length < count) {
                      fineTunedProblems.push("");
                    }
                    while (fineTunedProblems.length > count) {
                      fineTunedProblems.pop();
                    }
                    updateForm({
                      fineTunedProblemCount: value,
                      fineTunedProblems,
                    });
                  } else {
                    updateForm({ fineTunedProblemCount: value });
                    setFineTunedCountError(
                      !validInteger
                        ? "Must be a positive integer."
                        : "Must be at most 10.",
                    );
                  }
                }}
                disabled={presetLocked}
                className={`${styles.formInput} ${
                  fineTunedCountError ? styles.inputError : ""
                }`}
              />
              {fineTunedCountError && (
                <span className={styles.errorText}>{fineTunedCountError}</span>
              )}
            </div>

            <div className={styles.grid23}>
              {form.fineTunedProblems.map((problem, index) => (
                <div key={index} className={styles.field}>
                  <label className={styles.label} htmlFor={`problem-${index}`}>
                    Problem {index + 1}
                  </label>
                  <input
                    required
                    id={`problem-${index}`}
                    type="text"
                    placeholder="Eg. 4A"
                    value={problem}
                    onChange={(event) => {
                      const fineTunedProblems = [...form.fineTunedProblems];
                      fineTunedProblems[index] = event.target.value;
                      updateForm({ fineTunedProblems });
                    }}
                    disabled={presetLocked}
                    className={styles.formInput}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

      {form.problemSelectionMode === "fine-tuned" &&
        form.format === "bracket" && (
          <div className={styles.roundsList}>
            {syncedBracketRounds.map((round) => {
              const matchCount = Math.pow(
                2,
                bracketRoundCount - round.roundNumber,
              );
              return (
                <div key={round.roundNumber} className={styles.roundCard}>
                  <div className={styles.roundHeader}>
                    <span className={styles.roundLabel}>
                      {getRoundLabel(round.roundNumber)}
                    </span>
                    <span className={styles.roundMeta}>
                      {matchCount} match{matchCount > 1 ? "es" : ""} ×{" "}
                      {problemsPerMatch} problems ={" "}
                      <strong>{round.problemIds.length} IDs needed</strong>
                    </span>
                  </div>
                  <div className={styles.grid23}>
                    {round.problemIds.map((problemId, index) => (
                      <div key={index} className={styles.roundField}>
                        <label className={styles.roundFieldLabel}>
                          Match {Math.floor(index / problemsPerMatch) + 1} · P
                          {(index % problemsPerMatch) + 1}
                        </label>
                        <input
                          required
                          type="text"
                          placeholder="Eg. 4A"
                          value={problemId}
                          onChange={(event) => {
                            const updated = syncedBracketRounds.map(
                              (candidate) =>
                                candidate.roundNumber === round.roundNumber
                                  ? {
                                      ...candidate,
                                      problemIds: candidate.problemIds.map(
                                        (value, problemIndex) =>
                                          problemIndex === index
                                            ? event.target.value
                                            : value,
                                      ),
                                    }
                                  : candidate,
                            );
                            setBracketRoundProblems(updated);
                          }}
                          className={styles.formInput}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
