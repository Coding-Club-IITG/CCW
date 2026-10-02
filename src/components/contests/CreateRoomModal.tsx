"use client";

import { Lock, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatDateTimeInput, parseDateTimeInput } from "@/lib/shared/dates";
import { CONTEST_TIMING } from "@/lib/constants";
import { problemAllocationError } from "@/lib/contests/problemAllocation";
import { bracketProblemRequirements } from "@/lib/contests/bracketTopology";
import {
  createRoomContest,
  searchVerifiedUsers,
  createBracketContest,
} from "@/lib/actions/contests";
import { getDisplayName } from "@/lib/users/identity";
import {
  contestStartTimeError,
  type ContestRegistrationTiming,
} from "@/lib/contests/registrationTiming";

import { useRuntimeConfig } from "@/components/layout/Providers";
import ContestProblemConfiguration from "@/components/contests/ContestProblemConfiguration";
import {
  applyContestFormatDefaults,
  applyContestPreset,
  createInitialContestForm,
  getMaxParticipantsError,
  type ContestCreationPreset,
  type ContestCreationForm,
  type ContestParticipant,
} from "@/components/contests/contestCreationForm";
import CompatibleImage from "@/components/shared/CompatibleImage";
import Modal from "@/components/shared/Modal";
import UserAvatar from "@/components/shared/UserAvatar";
import { useToast } from "@/components/shared/Toast";

import styles from "./CreateRoomModal.module.scss";

export default function CreateRoomModal({
  isOpen,
  onClose,
  isHead = false,
  presets = [],
  registrationTiming,
}: {
  isOpen: boolean;
  onClose: () => void;
  isHead?: boolean;
  presets?: ContestCreationPreset[];
  registrationTiming: ContestRegistrationTiming;
}) {
  const { deadlineMinutes } = registrationTiming;
  const { contestDefaultMatchMinutes, contestDefaultBlitzProblemMinutes } =
    useRuntimeConfig();
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [topPresetId, setTopPresetId] = useState("");

  const getRatingClass = (rating: number | undefined) => {
    if (!rating) return styles.ratingGray;
    if (rating < 1200) return styles.ratingGray;
    if (rating < 1400) return styles.ratingGreen;
    if (rating < 1600) return styles.ratingCyan;
    if (rating < 1900) return styles.ratingBlue;
    if (rating < 2100) return styles.ratingViolet;
    if (rating < 2400) return styles.ratingOrange;
    return styles.ratingRed;
  };

  const [formData, setFormData] = useState(() =>
    createInitialContestForm(isHead, {
      overallMinutes: contestDefaultMatchMinutes,
      problemMinutes: contestDefaultBlitzProblemMinutes,
    }),
  );

  const [registeredUsers, setRegisteredUsers] = useState<ContestParticipant[]>(
    [],
  );
  const [manualTeams, setManualTeams] = useState<
    { id: string; name: string; members: ContestParticipant[] }[]
  >([]);
  // bracketRoundProblems: per-round problem ID arrays for fine-tuned bracket creation
  const [bracketRoundProblems, setBracketRoundProblems] = useState<
    { roundNumber: number; problemIds: string[] }[]
  >([]);
  const [activeSearchTeamId, setActiveSearchTeamId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ContestParticipant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsSearching(false);

    if (searchQuery.length < 2) {
      setSearchResults([]);

      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);

      try {
        const res = await searchVerifiedUsers(searchQuery);

        if (!cancelled && res.ok && res.data.users) {
          const isUserInAnyTeam = (id: string) =>
            manualTeams.some((t) => t.members.some((m) => m.id === id));
          const filtered = res.data.users.filter(
            (user) =>
              !registeredUsers.some((invitee) => invitee.id === user.id) &&
              !isUserInAnyTeam(user.id),
          );

          setSearchResults(filtered);
          setSelectedUserIndex(0);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, CONTEST_TIMING.searchDebounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [manualTeams, registeredUsers, searchQuery]);

  useEffect(() => {
    setFormData(applyContestFormatDefaults);
  }, [formData.format, formData.teamSize, formData.entrantCapacity]);

  const handleTopPresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;

    setTopPresetId(id);

    if (!id) return;

    const preset = presets.find((p) => p._id === id);

    if (preset) {
      setFormData((prev) => applyContestPreset(prev, preset));
    }
  };

  const [maxPartError, setMaxPartError] = useState("");
  const [fineTunedCountError, setFineTunedCountError] = useState("");

  useEffect(() => {
    setMaxPartError(
      getMaxParticipantsError(formData, manualTeams.length, isHead),
    );
  }, [formData, manualTeams.length, isHead]);

  if (!isOpen) return null;

  const isTeamSizeLocked = [
    "1v1",
    "solo-tournament",
    "team-tournament",
  ].includes(formData.format);
  const isMaxPartLocked = formData.format === "1v1";

  const useTeamsUI =
    !["1v1", "solo-tournament"].includes(formData.format) &&
    formData.teamSize > 1;
  const membersPerTeamLimit = formData.teamSize;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const start = parseDateTimeInput(formData.startTime);
    if (!start) {
      toast.error("A valid start time is required.");
      return;
    }
    const isCasual1v1 =
      formData.format === "1v1" && formData.registrationType === "closed";
    const startError = contestStartTimeError(
      start.toISOString(),
      isCasual1v1,
      registrationTiming,
    );

    if (startError) {
      toast.error(startError);

      return;
    }

    if (
      !isHead &&
      formData.format === "bracket" &&
      Number(formData.entrantCapacity) > 8
    ) {
      toast.error(
        "Non-admin users cannot create a knockout tournament with more than 8 entrants.",
      );

      return;
    }

    if (
      maxPartError ||
      (formData.problemSelectionMode === "fine-tuned" && fineTunedCountError)
    ) {
      return;
    }

    const overallDurationMinutes =
      typeof formData.overallDurationMinutes === "number" &&
      !Number.isNaN(formData.overallDurationMinutes)
        ? formData.overallDurationMinutes
        : contestDefaultMatchMinutes;

    const perProblemDurationMinutes =
      typeof formData.perProblemDurationMinutes === "number" &&
      !Number.isNaN(formData.perProblemDurationMinutes)
        ? formData.perProblemDurationMinutes
        : undefined;

    if (
      formData.format !== "bracket" &&
      formData.problemSelectionMode === "fine-tuned"
    ) {
      const emptyIndex = formData.fineTunedProblems.findIndex((p) => !p.trim());

      if (emptyIndex !== -1) {
        toast.error(`Please enter a Problem ID for Problem ${emptyIndex + 1}.`);

        return;
      }
    }

    let regStartIso = undefined;

    if (formData.registrationStartMode === "schedule") {
      const rStart = parseDateTimeInput(formData.registrationStartTime);

      if (!rStart || rStart.getTime() <= Date.now()) {
        toast.error("Scheduled registration start time must be in the future.");

        return;
      }

      if (rStart.getTime() >= start.getTime()) {
        toast.error("Registration must start before the contest deadline.");

        return;
      }

      regStartIso = rStart.toISOString();
    }

    let finalRegisteredUsers =
      formData.registrationType === "closed" ? registeredUsers : [];

    if (formData.registrationType === "closed") {
      if (useTeamsUI) {
        for (const team of manualTeams) {
          if (team.members.length !== membersPerTeamLimit) {
            toast.error(
              `Team "${team.name}" does not have exactly ${membersPerTeamLimit} member(s).`,
            );

            return;
          }
        }

        finalRegisteredUsers = manualTeams.flatMap((team) =>
          team.members.map((member) => ({ ...member, teamName: team.name })),
        );
      } else {
        if (formData.format === "1v1") {
          if (registeredUsers.length !== 2) {
            toast.error("1v1 format requires exactly 2 participants.");

            return;
          }
        }

        finalRegisteredUsers = registeredUsers.map((member) => ({
          ...member,
          teamName: member.name || member.cfHandle,
        }));
      }
    }

    if (formData.format === "bracket") {
      // If we are creating manually (no topPresetId), it's a custom bracket configuration
      const effectivePresetId = topPresetId ? formData.presetId : "custom";

      if (!effectivePresetId) {
        toast.error("Please select a match preset for the bracket.");

        return;
      }

      // Validate & build problemSlots for fine-tuned bracket mode
      let bracketProblemSlots: {
        platform: string;
        problemId: string;
        roundNumber: number;
      }[] = [];

      if (formData.problemSelectionMode === "fine-tuned") {
        for (const requirement of bracketProblemRequirements(
          formData.entrantCapacity,
          formData.bracketType || "single_elimination",
          formData.bulkProblemCount || 3,
        )) {
          const rnd = {
            roundNumber: requirement.roundNumber,
            problemIds: Array.from(
              { length: requirement.problemCount },
              (_, index) =>
                bracketRoundProblems.find(
                  (round) => round.roundNumber === requirement.roundNumber,
                )?.problemIds[index] ?? "",
            ),
          };

          for (const pid of rnd.problemIds) {
            if (!pid.trim()) {
              toast.error(
                `Round ${rnd.roundNumber}: all problem IDs must be filled in.`,
              );

              return;
            }

            bracketProblemSlots.push({
              platform: "codeforces",
              problemId: pid.trim(),
              roundNumber: rnd.roundNumber,
            });
          }
        }
      }

      const allocationError = problemAllocationError({
        ...formData,
        problemSlots: bracketProblemSlots,
      });

      if (allocationError) {
        toast.error(allocationError);
        return;
      }

      setLoading(true);

      try {
        const res = await createBracketContest({
          ...formData,
          presetId: effectivePresetId,
          overallDurationMinutes,
          perProblemDurationMinutes,
          deadline: start.toISOString(),
          registrationStartTime: regStartIso,
          registeredUsers: finalRegisteredUsers,
          fineTunedProblems:
            formData.problemSelectionMode === "fine-tuned"
              ? bracketProblemSlots.map((s) => s.problemId)
              : formData.fineTunedProblems.filter((p) => p.trim() !== ""),
          ...(formData.problemSelectionMode === "fine-tuned"
            ? {
                problemSlots: bracketProblemSlots,
              }
            : {}),
        });

        if (!res.ok) {
          toast.error(res.error.message);
        } else {
          onClose();
          router.refresh();
        }
      } catch {
        toast.error("Error creating bracket");
      } finally {
        setLoading(false);
      }

      return;
    }

    if (formData.problemSelectionMode === "fine-tuned") {
      const pids = formData.fineTunedProblems;

      if (!pids || pids.length === 0) {
        toast.error("Please specify at least one problem.");

        return;
      }

      for (let i = 0; i < pids.length; i++) {
        const pid = pids[i]?.trim();

        if (!pid) {
          toast.error(`Problem ${i + 1} ID is required.`);

          return;
        }

        const pts = formData.fineTunedProblemPoints?.[i];

        if (
          pts === undefined ||
          pts === null ||
          Number.isNaN(pts) ||
          typeof pts !== "number"
        ) {
          toast.error(`Problem ${i + 1} points are mandatory.`);

          return;
        }

        if (pts < 80) {
          toast.error(`Problem ${i + 1} points must be at least 80.`);

          return;
        }
      }
    }

    const fineTunedSlots =
      formData.problemSelectionMode === "fine-tuned" &&
      formData.fineTunedProblems.length > 0
        ? formData.fineTunedProblems.map((pid, idx) => {
            const rawPoints = formData.fineTunedProblemPoints?.[idx];

            return {
              platform: "codeforces",
              problemId: pid.trim(),
              points: rawPoints as number,
              timeLimitMinutes: formData.fineTunedProblemTimeLimits?.[idx],
            };
          })
        : undefined;

    setLoading(true);

    try {
      const res = await createRoomContest({
        ...formData,
        overallDurationMinutes,
        perProblemDurationMinutes,
        startTime: start.toISOString(),
        registrationStartTime: regStartIso,
        registeredUsers: finalRegisteredUsers,
        problemSlots: fineTunedSlots,
        fineTunedProblems: formData.fineTunedProblems.filter(
          (p) => p.trim() !== "",
        ),
      });

      if (!res.ok) {
        toast.error(res.error.message);
      } else {
        onClose();
        router.refresh();
      }
    } catch {
      toast.error("Error creating room");
    } finally {
      setLoading(false);
    }
  };

  const handleTimeAdd = (mins: number) => {
    const date = new Date();

    date.setMinutes(date.getMinutes() + mins);
    setFormData({ ...formData, startTime: formatDateTimeInput(date) });
  };

  const handleRegTimeAdd = (mins: number) => {
    const date = new Date();

    date.setMinutes(date.getMinutes() + mins);
    setFormData({
      ...formData,
      registrationStartTime: formatDateTimeInput(date),
    });
  };

  const removeUser = (id: string) => {
    setRegisteredUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const renderProblemConfiguration = () => (
    <ContestProblemConfiguration
      form={formData}
      setForm={setFormData}
      presetLocked={!!topPresetId}
      fineTunedCountError={fineTunedCountError}
      setFineTunedCountError={setFineTunedCountError}
      bracketRoundProblems={bracketRoundProblems}
      setBracketRoundProblems={setBracketRoundProblems}
    />
  );

  return (
    <Modal
      kicker="Contests"
      title="Create a room"
      onClose={onClose}
      closeDisabled={loading}
      maxWidth={672}
      contentClassName={styles.body}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelBtn}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-room-form"
            disabled={
              loading ||
              !!maxPartError ||
              (formData.problemSelectionMode === "fine-tuned" &&
                !!fineTunedCountError)
            }
            className={styles.primaryBtn}
          >
            {loading ? "Creating..." : "Create Room"}
          </button>
        </>
      }
    >
      <div>
        <form
          id="create-room-form"
          onSubmit={handleSubmit}
          className={styles.form}
          spellCheck={false}
        >
          <div className={styles.templateBox}>
            <div className={styles.templateHeader}>
              <label className={styles.templateLabel} htmlFor="top-preset-id">
                Load from Template (Optional)
              </label>
              <Link
                href="/internal/contests/presets"
                target="_blank"
                className={styles.managePresetsLink}
              >
                Manage Presets
              </Link>
            </div>
            {presets.length > 0 ? (
              <>
                <select
                  id="top-preset-id"
                  value={topPresetId}
                  onChange={handleTopPresetChange}
                  className={`${styles.formInput} ${styles.formSelect}`}
                >
                  <option value="">No template (Manual setup)</option>
                  {presets.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className={styles.hintMuted}>
                  Selecting a template will auto-fill and lock the configuration
                  below.
                </span>
              </>
            ) : (
              <>
                <select
                  className={`${styles.formInput} ${styles.formSelect}`}
                  disabled
                >
                  <option>No templates available</option>
                </select>
                <span className={styles.emptyPresetsHint}>
                  You don&apos;t have any templates yet. Create one to quickly
                  load settings.
                </span>
              </>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="room-name">
              Name
            </label>
            <input
              required
              id="room-name"
              type="text"
              spellCheck={false}
              placeholder="Enter room name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className={styles.formInput}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="room-description">
              Description (Optional)
            </label>
            <textarea
              id="room-description"
              spellCheck={false}
              placeholder="Enter room description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className={`${styles.formInput} ${styles.formTextarea}`}
              maxLength={500}
            />
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="room-mode">
                Mode
              </label>
              <select
                id="room-mode"
                value={formData.mode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    mode: e.target.value as ContestCreationForm["mode"],
                  })
                }
                disabled={!!topPresetId}
                className={`${styles.formInput} ${styles.formSelect}`}
              >
                <option value="blitz">Blitz</option>
                <option value="arena">Arena</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="room-format">
                Format
              </label>
              <select
                id="room-format"
                value={formData.format}
                onChange={(e) => {
                  const nextFormat = e.target
                    .value as ContestCreationForm["format"];

                  setFormData((prev) =>
                    applyContestFormatDefaults({ ...prev, format: nextFormat }),
                  );
                }}
                disabled={!!topPresetId}
                className={`${styles.formInput} ${styles.formSelect}`}
              >
                <option value="1v1">1v1</option>
                <option value="solo-tournament">Solo Tournament</option>
                <option value="team-tournament">Team Battle</option>
                <option value="bracket">Bracket</option>
              </select>
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="team-size">
                Team Size
              </label>
              <select
                id="team-size"
                value={formData.teamSize}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    teamSize: parseInt(e.target.value),
                  })
                }
                disabled={isTeamSizeLocked}
                className={`${styles.formInput} ${styles.formSelect}`}
              >
                <option value={1}>1 Player (Solo)</option>
                <option value={3}>3 Players (ICPC)</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="max-participants">
                {formData.format === "bracket"
                  ? "Max Entrants (players or teams)"
                  : "Max Participants"}
              </label>
              <input
                required
                id="max-participants"
                type="number"
                min={formData.format === "team-tournament" ? 6 : 2}
                step={formData.format === "team-tournament" ? 3 : 1}
                value={
                  Number.isNaN(
                    formData.format === "bracket"
                      ? formData.entrantCapacity
                      : formData.maxParticipants,
                  )
                    ? ""
                    : formData.format === "bracket"
                      ? formData.entrantCapacity
                      : formData.maxParticipants
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    ...(formData.format === "bracket"
                      ? {
                          entrantCapacity: parseInt(e.target.value),
                          maxParticipants:
                            parseInt(e.target.value) * formData.teamSize,
                        }
                      : { maxParticipants: parseInt(e.target.value) }),
                  })
                }
                disabled={isMaxPartLocked}
                className={`${styles.formInput} ${
                  maxPartError ? styles.inputError : ""
                }`}
              />
              {maxPartError && (
                <span className={styles.errorText}>{maxPartError}</span>
              )}
            </div>
          </div>

          {formData.format !== "bracket" && renderProblemConfiguration()}

          {formData.format === "bracket" && (
            <div className={styles.sectionBlock}>
              <div className={styles.sectionTitleRow}>
                <h3 className={styles.sectionHeading}>Bracket Settings</h3>
                {!!topPresetId && (
                  <Lock
                    className={`${styles.lockIcon} ${styles.iconFilled}`}
                    size={18}
                  />
                )}
              </div>

              {!!topPresetId &&
                (() => {
                  const selectedMatchPreset = presets.find(
                    (p) => p._id === formData.presetId,
                  );

                  return selectedMatchPreset ? (
                    <div className={styles.presetInfo}>
                      <span className={styles.presetInfoName}>
                        Preset: {selectedMatchPreset.name}
                      </span>
                      {selectedMatchPreset.description && (
                        <span>{selectedMatchPreset.description}</span>
                      )}
                      <div className={styles.presetInfoMeta}>
                        <span>• {selectedMatchPreset.mode}</span>
                        {selectedMatchPreset.problemSelectionMode === "bulk" ? (
                          <span>
                            • {selectedMatchPreset.bulkProblemCount} problems (
                            {selectedMatchPreset.bulkRatingMin}-
                            {selectedMatchPreset.bulkRatingMax})
                          </span>
                        ) : (
                          <span>
                            • {selectedMatchPreset.fineTunedProblemCount}{" "}
                            specific problems
                          </span>
                        )}
                      </div>
                    </div>
                  ) : null;
                })()}

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="bracket-type">
                    Elimination Type
                  </label>
                  <select
                    id="bracket-type"
                    value={formData.bracketType || "single_elimination"}
                    disabled={!!topPresetId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bracketType: e.target.value as
                          "single_elimination" | "double_elimination",
                      })
                    }
                    className={`${styles.formInput} ${styles.formSelect}`}
                  >
                    <option value="single_elimination">
                      Single Elimination
                    </option>
                    <option value="double_elimination">
                      Double Elimination
                    </option>
                  </select>
                </div>

                <p className={styles.hintMuted}>
                  Seeds use Codeforces ratings frozen at bracket generation,
                  averaged for teams. Highest seeds receive byes.
                </p>
              </div>

              {!topPresetId && renderProblemConfiguration()}
            </div>
          )}

          {/* Scheduled Registration Section */}
          <div className={styles.regSection}>
            <h4 className={styles.regTitle}>Registration Window</h4>

            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Registration Type</label>
                <select
                  value={formData.registrationType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      registrationType: e.target
                        .value as ContestCreationForm["registrationType"],
                    })
                  }
                  className={`${styles.formInput} ${styles.formSelect}`}
                >
                  <option value="open">Open (Public)</option>
                  <option value="closed">Closed (Manual Registration)</option>
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Spectator Access</label>
                <select
                  value={formData.spectatorRestriction}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      spectatorRestriction: e.target
                        .value as ContestCreationForm["spectatorRestriction"],
                    })
                  }
                  className={`${styles.formInput} ${styles.formSelect}`}
                >
                  <option value="none">No Spectators</option>
                  <option value="all">Any Authenticated User</option>
                  <option value="club_members">Club / Module Members</option>
                  <option value="admin_creator">Admins & Creator Only</option>
                </select>
              </div>
            </div>

            {formData.registrationType !== "closed" && (
              <div className={styles.field}>
                <label className={styles.label}>Registration Starts</label>
                <select
                  value={formData.registrationStartMode}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      registrationStartMode: e.target.value,
                    })
                  }
                  className={`${styles.formInput} ${styles.formSelect}`}
                >
                  <option value="immediate">Immediately</option>
                  <option value="schedule">Schedule Start</option>
                </select>
              </div>
            )}

            {formData.registrationType !== "closed" &&
              formData.registrationStartMode === "schedule" && (
                <div className={styles.regSub}>
                  <label className={styles.label}>
                    Registration Start Time (IST)
                  </label>
                  <div className={styles.field}>
                    <input
                      required={formData.registrationStartMode === "schedule"}
                      type="datetime-local"
                      value={formData.registrationStartTime}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          registrationStartTime: e.target.value,
                        })
                      }
                      className={`${styles.formInput} ${styles.dateInput}`}
                    />
                    <div className={styles.timeChipRow}>
                      <button
                        type="button"
                        onClick={() => handleRegTimeAdd(3)}
                        className={styles.timeChip}
                      >
                        +3m
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegTimeAdd(15)}
                        className={styles.timeChip}
                      >
                        +15m
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegTimeAdd(60)}
                        className={styles.timeChip}
                      >
                        +1h
                      </button>
                    </div>
                  </div>
                </div>
              )}

            {formData.registrationType === "closed" && (
              <div className={styles.regMembersBlock}>
                <label className={styles.label}>
                  {useTeamsUI ? "Add Teams" : "Add Participants"}
                </label>

                {useTeamsUI ? (
                  <div className={styles.teamsList}>
                    {manualTeams.map((team, teamIndex) => (
                      <div key={team.id} className={styles.teamCard}>
                        <div className={styles.teamCardHeader}>
                          <div className={styles.teamNameWrap}>
                            <input
                              type="text"
                              value={team.name}
                              onChange={(e) => {
                                const newTeams = [...manualTeams];

                                newTeams[teamIndex].name = e.target.value;
                                setManualTeams(newTeams);
                              }}
                              className={styles.teamNameInput}
                              placeholder="Team Name"
                            />
                            <Pencil className={styles.editIcon} size={16} />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setManualTeams(
                                manualTeams.filter((t) => t.id !== team.id),
                              )
                            }
                            className={styles.iconBtnDanger}
                          >
                            <Trash2 className={styles.icon18} size={18} />
                          </button>
                        </div>

                        <div className={styles.teamMembers}>
                          {team.members.map((member) => (
                            <div key={member.id} className={styles.memberRow}>
                              <div className={styles.memberInfo}>
                                <UserAvatar
                                  name={member.name}
                                  image={member.image}
                                  size={24}
                                />
                                <span className={styles.memberName}>
                                  {getDisplayName(
                                    member.name,
                                    member.pizza_count,
                                  )}
                                </span>
                                <span className={styles.sep}>|</span>
                                <span
                                  className={`${styles.ratingValue} ${getRatingClass(
                                    member.cfRating,
                                  )}`}
                                >
                                  {member.cfRating || "Unrated"}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const newTeams = [...manualTeams];

                                  newTeams[teamIndex].members = newTeams[
                                    teamIndex
                                  ].members.filter((m) => m.id !== member.id);
                                  setManualTeams(newTeams);
                                }}
                                className={styles.iconBtnMuted}
                              >
                                <X className={styles.icon16} size={16} />
                              </button>
                            </div>
                          ))}

                          {team.members.length < membersPerTeamLimit && (
                            <div className={styles.searchWrap}>
                              <input
                                type="text"
                                placeholder="Search to add member..."
                                value={
                                  activeSearchTeamId === team.id
                                    ? searchQuery
                                    : ""
                                }
                                onFocus={() => {
                                  setActiveSearchTeamId(team.id);
                                  setSearchQuery("");
                                }}
                                onChange={(e) => {
                                  setActiveSearchTeamId(team.id);
                                  setSearchQuery(e.target.value);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setSelectedUserIndex((prev) =>
                                      Math.min(
                                        prev + 1,
                                        searchResults.length - 1,
                                      ),
                                    );
                                  } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setSelectedUserIndex((prev) =>
                                      Math.max(prev - 1, 0),
                                    );
                                  } else if (e.key === "Enter") {
                                    e.preventDefault();

                                    if (
                                      searchResults.length > 0 &&
                                      selectedUserIndex >= 0 &&
                                      selectedUserIndex < searchResults.length
                                    ) {
                                      const newTeams = [...manualTeams];

                                      newTeams[teamIndex].members.push(
                                        searchResults[selectedUserIndex],
                                      );
                                      setManualTeams(newTeams);
                                      setSearchQuery("");
                                      setSearchResults([]);
                                      setSelectedUserIndex(0);
                                    }
                                  }
                                }}
                                className={styles.formInput}
                              />
                              {activeSearchTeamId === team.id &&
                                isSearching && (
                                  <RefreshCw
                                    className={styles.searchSpinner}
                                    size={18}
                                  />
                                )}
                              {activeSearchTeamId === team.id &&
                                searchQuery.length >= 2 &&
                                searchResults.length > 0 && (
                                  <div className={styles.searchDropdown}>
                                    {searchResults.map((user, index) => (
                                      <div
                                        key={user.id}
                                        className={`${styles.searchItem} ${
                                          index === selectedUserIndex
                                            ? styles.searchItemActive
                                            : ""
                                        }`}
                                        onClick={() => {
                                          const newTeams = [...manualTeams];

                                          newTeams[teamIndex].members.push(
                                            user,
                                          );
                                          setManualTeams(newTeams);
                                          setSearchQuery("");
                                          setSearchResults([]);
                                          setSelectedUserIndex(0);
                                        }}
                                      >
                                        <UserAvatar
                                          name={user.name}
                                          image={user.image}
                                          size={24}
                                        />
                                        <div className={styles.searchUserCol}>
                                          <div className={styles.searchUserTop}>
                                            <span
                                              className={styles.searchUserName}
                                            >
                                              {getDisplayName(
                                                user.name,
                                                user.pizza_count,
                                              )}
                                            </span>
                                            <span
                                              className={styles.searchSepInline}
                                            >
                                              |
                                            </span>
                                            <span
                                              className={`${styles.searchUserRating} ${getRatingClass(
                                                user.cfRating,
                                              )}`}
                                            >
                                              {user.cfRating || "Unrated"}
                                            </span>
                                          </div>
                                          <span
                                            className={styles.searchUserHandle}
                                          >
                                            {user.cfHandle}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        setManualTeams([
                          ...manualTeams,
                          {
                            id: crypto.randomUUID(),
                            name: `Team ${manualTeams.length + 1}`,
                            members: [],
                          },
                        ])
                      }
                      disabled={
                        manualTeams.length >=
                        Math.floor(
                          formData.maxParticipants / membersPerTeamLimit,
                        )
                      }
                      className={styles.addTeamBtn}
                    >
                      <Plus className={styles.icon18} size={18} />
                      Add Team{" "}
                      {manualTeams.length >=
                        Math.floor(
                          formData.maxParticipants / membersPerTeamLimit,
                        ) && "(Max Limit Reached)"}
                    </button>
                  </div>
                ) : (
                  <div className={styles.teamMembers}>
                    {(formData.format !== "1v1" ||
                      registeredUsers.length < 2) && (
                      <div className={styles.searchWrap}>
                        <input
                          type="text"
                          disabled={
                            registeredUsers.length >= formData.maxParticipants
                          }
                          placeholder={
                            registeredUsers.length >= formData.maxParticipants
                              ? "Max limit reached"
                              : "Search to register participant..."
                          }
                          value={activeSearchTeamId === null ? searchQuery : ""}
                          onFocus={() => {
                            setActiveSearchTeamId(null);
                            setSearchQuery("");
                          }}
                          onChange={(e) => {
                            setActiveSearchTeamId(null);
                            setSearchQuery(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setSelectedUserIndex((prev) =>
                                Math.min(prev + 1, searchResults.length - 1),
                              );
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setSelectedUserIndex((prev) =>
                                Math.max(prev - 1, 0),
                              );
                            } else if (e.key === "Enter") {
                              e.preventDefault();

                              if (
                                searchResults.length > 0 &&
                                selectedUserIndex >= 0 &&
                                selectedUserIndex < searchResults.length
                              ) {
                                setRegisteredUsers((prev) => [
                                  ...prev,
                                  searchResults[selectedUserIndex],
                                ]);
                                setSearchQuery("");
                                setSearchResults([]);
                                setSelectedUserIndex(0);
                              }
                            }
                          }}
                          className={styles.formInput}
                        />
                        {activeSearchTeamId === null && isSearching && (
                          <RefreshCw
                            className={styles.searchSpinner}
                            size={18}
                          />
                        )}
                        {activeSearchTeamId === null &&
                          searchQuery.length >= 2 &&
                          searchResults.length > 0 && (
                            <div className={styles.searchDropdown}>
                              {searchResults.map((user, index) => (
                                <div
                                  key={user.id}
                                  className={`${styles.searchItem} ${
                                    index === selectedUserIndex
                                      ? styles.searchItemActive
                                      : ""
                                  }`}
                                  onClick={() => {
                                    setRegisteredUsers((prev) => [
                                      ...prev,
                                      user,
                                    ]);
                                    setSearchQuery("");
                                    setSearchResults([]);
                                    setSelectedUserIndex(0);
                                  }}
                                >
                                  <UserAvatar
                                    name={user.name}
                                    image={user.image}
                                    size={24}
                                  />
                                  <div className={styles.searchUserCol}>
                                    <div className={styles.searchUserTop}>
                                      <span className={styles.searchUserName}>
                                        {getDisplayName(
                                          user.name,
                                          user.pizza_count,
                                        )}
                                      </span>
                                      <span className={styles.searchSepInline}>
                                        |
                                      </span>
                                      <span
                                        className={`${styles.searchUserRating} ${getRatingClass(
                                          user.cfRating,
                                        )}`}
                                      >
                                        {user.cfRating || "Unrated"}
                                      </span>
                                    </div>
                                    <span className={styles.searchUserHandle}>
                                      {user.cfHandle}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}

                {formData.teamSize === 1 && registeredUsers.length > 0 && (
                  <>
                    <div className={styles.chipList}>
                      {registeredUsers.map((u) => (
                        <div key={u.id} className={styles.chip}>
                          <UserAvatar name={u.name} image={u.image} size={24} />
                          <div className={styles.chipBody}>
                            <span className={styles.memberName}>
                              {getDisplayName(u.name, u.pizza_count)}
                            </span>
                            <span className={styles.sep}>|</span>
                            <span
                              className={`${styles.ratingValue} ${getRatingClass(
                                u.cfRating,
                              )}`}
                            >
                              {u.cfRating || "Unrated"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeUser(u.id)}
                            className={styles.iconBtnChip}
                          >
                            <X className={styles.icon16} size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <span className={styles.hintMuted}>
                  These members will be automatically registered when the
                  contest begins.
                </span>
              </div>
            )}
          </div>

          <div className={styles.startTimeBlock}>
            <label className={styles.label} htmlFor="start-time">
              Match Start Time (IST)
            </label>
            <div className={styles.field}>
              <input
                required
                id="start-time"
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) =>
                  setFormData({ ...formData, startTime: e.target.value })
                }
                className={`${styles.formInput} ${styles.dateInput}`}
              />
              {(() => {
                const isCasual1v1 =
                  formData.format === "1v1" &&
                  formData.registrationType === "closed";
                const quickAddMins = isCasual1v1
                  ? [2, 3, 5, 10]
                  : [deadlineMinutes + 2, deadlineMinutes + 3, 10, 15];

                return (
                  <div className={styles.timeAddRow}>
                    {quickAddMins.map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => handleTimeAdd(mins)}
                        className={styles.timeAddBtn}
                      >
                        +{mins} min{mins > 1 ? "s" : ""}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            <span className={styles.hint}>
              {formData.format === "1v1" &&
              formData.registrationType === "closed"
                ? "Casual 1v1 matches can start as soon as 2 minutes from now."
                : `Scheduled tournaments start automatically. Registration deadline is ${deadlineMinutes} minute${deadlineMinutes > 1 ? "s" : ""} before the start time.`}
            </span>
          </div>
        </form>
      </div>
    </Modal>
  );
}
