"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import {
  setDailyProblem,
  getScheduledChallenges,
  deleteScheduledChallenge,
  type ScheduledChallenge,
} from "@/lib/actions/admin/potd";
import {
  DIFFICULTIES,
  PLATFORMS,
  PLATFORM_DISPLAY_NAMES,
} from "@/lib/constants";
import type { Platform } from "@/lib/constants";
import {
  formatDate,
  getAvailableDates,
  getTodayISTDateStr,
} from "@/lib/potd/utils";

import EmptyState from "@/components/shared/EmptyState";
import { CardGridSkeletonContent } from "@/components/shared/skeletons/CardGridSkeleton";
import { useToast } from "@/components/shared/Toast";
import { useConfirm } from "@/components/shared/useConfirm";

import AutoProblemModal from "./AutoProblemModal";
import { ScheduledProblemCard } from "./ScheduledProblemCard";
import styles from "./SetProblem.module.scss";

type FormData = {
  date: string;
  difficulty: "Easy" | "Medium" | "Hard";
  platform: Platform;
  problemId: string;
};

export default function SetProblemClient() {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const availableDates = getAvailableDates();
  const todayIST = getTodayISTDateStr();

  const [problems, setProblems] = useState<ScheduledChallenge[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    date: "",
    difficulty: "Easy",
    platform: "codeforces",
    problemId: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);

  useEffect(() => {
    fetchScheduled();
  }, []);

  async function fetchScheduled() {
    setLoadingInitial(true);
    try {
      const result = await getScheduledChallenges();
      if (result.ok) {
        setProblems(result.data);
      }
    } finally {
      setLoadingInitial(false);
    }
  }

  // Returns which difficulties are already taken for a date
  const takenDifficulties = (dateStr: string) =>
    new Set(
      problems.filter((p) => p.dateStr === dateStr).map((p) => p.difficulty),
    );

  const handleAddNew = () => {
    setFormError(null);
    // Pre-select first date that has at least 1 free difficulty slot
    const firstOpenDate =
      availableDates.find((d) => takenDifficulties(d).size < 3) ??
      availableDates[0];
    // Pre-select 1st free difficulty for that date
    const taken = takenDifficulties(firstOpenDate);
    const firstFreeDiff = DIFFICULTIES.find((d) => !taken.has(d)) ?? "Easy";
    setFormData({
      date: firstOpenDate,
      difficulty: firstFreeDiff,
      platform: "codeforces",
      problemId: "",
    });
    setIsAdding(true);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setFormData({
      date: "",
      difficulty: "Easy",
      platform: "codeforces",
      problemId: "",
    });
    setFormError(null);
  };

  const handleSave = async (force: boolean = false) => {
    if (!formData.date || !formData.problemId || !formData.difficulty) {
      setFormError("All fields are required.");
      return;
    }

    if (formData.platform === "codeforces") {
      const idMatches = formData.problemId.match(/^(\d+)\s*([A-Z0-9]+)$/i);
      if (!idMatches) {
        setFormError("Invalid Problem ID. Use format like '158A' or '1234B1'.");
        return;
      }
    } else {
      if (!/^[a-z0-9]+[_/][a-z0-9_]+$/i.test(formData.problemId)) {
        setFormError(
          "Invalid AtCoder Problem ID. Use format like 'abc123_a' or 'abc300_d'.",
        );
        return;
      }
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const result = await setDailyProblem(
        formData.date,
        formData.problemId,
        formData.difficulty,
        formData.platform,
        force,
      );
      if (!result.ok) {
        if (/already used/i.test(result.error.message)) {
          const confirmed = await confirm({
            title: "Schedule this problem anyway?",
            description: result.error.message,
            confirmLabel: "Schedule anyway",
            variant: "primary",
          });
          if (confirmed) await handleSave(true);
          return;
        }
        setFormError(result.error.message);
        return;
      }
      setIsAdding(false);
      setFormData({
        date: "",
        difficulty: "Easy",
        platform: "codeforces",
        problemId: "",
      });
      await fetchScheduled();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, isToday: boolean) => {
    const confirmed = await confirm({
      title: isToday ? "Remove today's live problem?" : "Remove this problem?",
      description: isToday
        ? "This problem is live today. Removing it takes it out of the daily challenge for everyone."
        : "This scheduled problem will be removed from the upcoming rotation.",
      confirmLabel: "Remove",
    });
    if (!confirmed) return;
    setDeletingId(id);
    try {
      const result = await deleteScheduledChallenge(id);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      await fetchScheduled();
    } finally {
      setDeletingId(null);
    }
  };

  // Group problems by date for display
  const byDate = availableDates
    .map((dateStr) => ({
      dateStr,
      isToday: dateStr === todayIST,
      entries: problems.filter((p) => p.dateStr === dateStr),
    }))
    .filter((g) => g.entries.length > 0 || isAdding);

  const totalScheduled = problems.length;
  const maxSlots = 11 * 3; // 11 days × 3 difficulties
  const hasOpenSlots =
    problems.length < maxSlots &&
    availableDates.some((d) => takenDifficulties(d).size < 3);

  const header = (
    <div className={styles.header}>
      <div className={styles.headerFlex}>
        <div>
          <h1>Manage Upcoming Problems</h1>
          <p>
            Schedule up to 10 days in advance. Each day can have up to 3
            problems (Easy, Medium, Hard). Today&apos;s problems can be edited
            until end of day.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.autoBtn}
            onClick={() => setIsAutoModalOpen(true)}
            disabled={loadingInitial || isAdding || !hasOpenSlots}
          >
            <Sparkles size={16} />
            Auto Problem Setting
          </button>
          <button
            className={styles.addBtn}
            onClick={handleAddNew}
            disabled={loadingInitial || isAdding || !hasOpenSlots}
          >
            + Add Problem
          </button>
        </div>
      </div>
    </div>
  );

  if (loadingInitial) {
    return (
      <div>
        {header}
        <CardGridSkeletonContent label="upcoming problems" cards={6} />
      </div>
    );
  }

  return (
    <div>
      {header}

      <div className={styles.grid}>
        {/* Add form */}
        {isAdding && (
          <div className={styles.editCard}>
            <div className={styles.editHeader}>
              <h3>Schedule New Problem</h3>
            </div>
            <div className={styles.formGrid}>
              {/* Date */}
              <div className={styles.formGroup}>
                <label htmlFor="editDate">Date (IST)</label>
                <select
                  id="editDate"
                  title="Select Date"
                  value={formData.date}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    const taken = takenDifficulties(newDate);
                    const freeDiff =
                      DIFFICULTIES.find((d) => !taken.has(d)) ?? "Easy";
                    setFormData({
                      ...formData,
                      date: newDate,
                      difficulty: taken.has(formData.difficulty)
                        ? freeDiff
                        : formData.difficulty,
                    });
                  }}
                >
                  {availableDates.map((d) => {
                    const taken = takenDifficulties(d);
                    const full = taken.size >= 3;
                    return (
                      <option key={d} value={d} disabled={full}>
                        {d === todayIST ? "Today" : formatDate(d, "short")}{" "}
                        {full
                          ? "(full)"
                          : taken.size > 0
                            ? `(${taken.size}/3)`
                            : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Difficulty */}
              <div className={styles.formGroup}>
                <label htmlFor="editDifficulty">Difficulty</label>
                <select
                  id="editDifficulty"
                  title="Select Difficulty"
                  value={formData.difficulty}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      difficulty: e.target.value as "Easy" | "Medium" | "Hard",
                    })
                  }
                >
                  {DIFFICULTIES.map((d) => {
                    const taken = takenDifficulties(formData.date);
                    return (
                      <option key={d} value={d} disabled={taken.has(d)}>
                        {d} {taken.has(d) ? "(taken)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Platform */}
              <div className={styles.formGroup}>
                <label htmlFor="editPlatform">Platform</label>
                <select
                  id="editPlatform"
                  title="Select Platform"
                  value={formData.platform}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      platform: e.target.value as Platform,
                      problemId: "",
                    })
                  }
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_DISPLAY_NAMES[p]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Problem ID */}
              <div className={styles.formGroup}>
                <label>Problem ID</label>
                <input
                  type="text"
                  title={
                    formData.platform === "codeforces"
                      ? "Codeforces Problem ID (Eg. 158A)"
                      : "AtCoder Problem ID (Eg. abc123_a)"
                  }
                  placeholder={
                    formData.platform === "codeforces"
                      ? "Eg. 158A or 1234B1"
                      : "Eg. abc123_a or abc300_d"
                  }
                  value={formData.problemId}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      problemId: e.target.value.toUpperCase(),
                    })
                  }
                  disabled={isSaving}
                />
              </div>
            </div>

            {formError && <p className={styles.formError}>{formError}</p>}

            <div className={styles.actions}>
              <button
                className={styles.cancelBtn}
                onClick={handleCancelAdd}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                className={styles.saveBtn}
                onClick={() => handleSave()}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Fetch & Save"}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loadingInitial && totalScheduled === 0 && !isAdding && (
          <EmptyState
            title="No upcoming problems scheduled."
            hint='Click "Add Problem" to get started.'
          />
        )}

        {/* Problems grouped by date */}
        {byDate.map(({ dateStr, isToday, entries }) =>
          entries.map((prob) => (
            <ScheduledProblemCard
              key={prob.id}
              prob={prob}
              isToday={isToday}
              onDelete={handleDelete}
              disabled={isAdding || deletingId === prob.id}
            />
          )),
        )}
      </div>

      {isAutoModalOpen && (
        <AutoProblemModal
          onClose={() => setIsAutoModalOpen(false)}
          availableDates={availableDates}
          takenDifficultiesMap={takenDifficulties}
          onSuccess={fetchScheduled}
        />
      )}
      {confirmDialog}
    </div>
  );
}
