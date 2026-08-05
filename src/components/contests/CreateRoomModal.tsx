"use client";

import { useState, useEffect } from "react";
import {
  GripVertical,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  createRoomContest,
  searchVerifiedUsers,
  createBracketContest,
} from "@/lib/actions/contests";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getDisplayName } from "@/lib/utils";
import { CF_CONTEST_YEAR_OPTIONS } from "@/lib/constants";
import CompatibleImage from "@/components/shared/CompatibleImage";
import ContestProblemConfiguration from "@/components/contests/ContestProblemConfiguration";
import {
  applyContestFormatDefaults,
  applyContestPreset,
  createInitialContestForm,
  getMaxParticipantsError,
  reorderContestEntries,
} from "@/components/contests/contestCreationForm";
import styles from "./CreateRoomModal.module.scss";

export default function CreateRoomModal({
  isOpen,
  onClose,
  isHead = false,
  presets = [],
  deadlineMinutes = 1,
}: {
  isOpen: boolean;
  onClose: () => void;
  isHead?: boolean;
  presets?: any[];
  deadlineMinutes?: number;
}) {
  const router = useRouter();
  const { data: session } = useSession();
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

  const [formData, setFormData] = useState(createInitialContestForm);

  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);
  const [manualTeams, setManualTeams] = useState<
    { id: string; name: string; members: any[] }[]
  >([]);
  // bracketRoundProblems: per-round problem ID arrays for fine-tuned bracket creation
  const [bracketRoundProblems, setBracketRoundProblems] = useState<
    { roundNumber: number; problemIds: string[] }[]
  >([]);
  const [activeSearchTeamId, setActiveSearchTeamId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);
  const [draggedUserIndex, setDraggedUserIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggedTeamIndex, setDraggedTeamIndex] = useState<number | null>(null);
  const [dragOverTeamIndex, setDragOverTeamIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchVerifiedUsers(searchQuery);
        if (res.users) {
          const isUserInAnyTeam = (id: string) =>
            manualTeams.some((t) => t.members.some((m) => m.id === id));
          const filtered = res.users.filter(
            (u: any) =>
              !registeredUsers.some((inv) => inv.id === u.id) &&
              !isUserInAnyTeam(u.id),
          );
          setSearchResults(filtered);
          setSelectedUserIndex(0);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [manualTeams, registeredUsers, searchQuery]);

  useEffect(() => {
    setFormData(applyContestFormatDefaults);
  }, [formData.format]);

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
    setMaxPartError(getMaxParticipantsError(formData, manualTeams.length));
  }, [formData, manualTeams.length]);

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

    const start = new Date(formData.startTime);
    // Dynamic check based on environment variable passed down from server.
    // Eg. if deadlineMinutes is 1, minimum wait is (1 + 1) = 2 mins.
    const requiredBufferMinutes = deadlineMinutes + 1;
    if (start.getTime() < Date.now() + requiredBufferMinutes * 60000 - 5000) {
      alert(
        `Start time (Deadline) must be at least ${requiredBufferMinutes} minutes ahead of the current time (to allow for the ${deadlineMinutes}-minute registration deadline plus a 1-minute buffer).`,
      );
      return;
    }

    if (
      maxPartError ||
      (formData.problemSelectionMode === "fine-tuned" && fineTunedCountError)
    ) {
      return;
    }

    if (
      formData.format !== "bracket" &&
      formData.problemSelectionMode === "fine-tuned"
    ) {
      const emptyIndex = formData.fineTunedProblems.findIndex((p) => !p.trim());
      if (emptyIndex !== -1) {
        alert(`Please enter a Problem ID for Problem ${emptyIndex + 1}.`);
        return;
      }
    }

    let regStartIso = undefined;
    if (formData.registrationStartMode === "schedule") {
      const rStart = new Date(formData.registrationStartTime);
      if (isNaN(rStart.getTime()) || rStart.getTime() <= Date.now()) {
        alert("Scheduled registration start time must be in the future.");
        return;
      }
      if (rStart.getTime() >= start.getTime()) {
        alert("Registration must start before the contest deadline.");
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
            alert(
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
            alert("1v1 format requires exactly 2 participants.");
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
      if (!formData.presetId) {
        alert("Please select a match preset for the bracket.");
        return;
      }

      // Validate & build problemSlots for fine-tuned bracket mode
      let bracketProblemSlots: {
        platform: string;
        problemId: string;
        roundNumber: number;
      }[] = [];
      if (formData.problemSelectionMode === "fine-tuned") {
        for (const rnd of bracketRoundProblems) {
          for (const pid of rnd.problemIds) {
            if (!pid.trim()) {
              alert(
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

      setLoading(true);
      try {
        const res = await createBracketContest({
          ...formData,
          deadline: start.toISOString(),
          registrationStartTime: regStartIso,
          registeredUsers: finalRegisteredUsers,
          ...(formData.problemSelectionMode === "fine-tuned"
            ? {
                fineTunedProblems: bracketProblemSlots.map((s) => s.problemId),
                problemSlots: bracketProblemSlots,
              }
            : {}),
        });
        if (!res.success) {
          alert(res.error);
        } else {
          onClose();
          router.refresh();
        }
      } catch {
        alert("Error creating bracket");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const res = await createRoomContest({
        ...formData,
        startTime: start.toISOString(),
        registrationStartTime: regStartIso,
        registeredUsers: finalRegisteredUsers,
      });
      if (res.error) {
        alert(res.error);
      } else {
        onClose();
        router.refresh();
      }
    } catch (err: any) {
      alert("Error creating room");
    } finally {
      setLoading(false);
    }
  };

  const handleTimeAdd = (mins: number) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + mins);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    setFormData({ ...formData, startTime: date.toISOString().slice(0, 16) });
  };

  const handleRegTimeAdd = (mins: number) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + mins);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    setFormData({
      ...formData,
      registrationStartTime: date.toISOString().slice(0, 16),
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedUserIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Required for Firefox
    e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedUserIndex !== null && draggedUserIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedUserIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const draggedIdxStr = e.dataTransfer.getData("text/plain");
    if (!draggedIdxStr) {
      handleDragEnd();
      return;
    }
    const draggedIdx = parseInt(draggedIdxStr, 10);
    if (draggedIdx === index) {
      handleDragEnd();
      return;
    }

    setRegisteredUsers((prev) => {
      return reorderContestEntries(prev, draggedIdx, index);
    });

    handleDragEnd();
  };

  const removeUser = (id: string) => {
    setRegisteredUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const moveUserUp = (index: number) => {
    if (index === 0) return;
    setRegisteredUsers((prev) => {
      const newUsers = [...prev];
      [newUsers[index - 1], newUsers[index]] = [
        newUsers[index],
        newUsers[index - 1],
      ];
      return newUsers;
    });
  };

  const moveUserDown = (index: number) => {
    if (index === registeredUsers.length - 1) return;
    setRegisteredUsers((prev) => {
      const newUsers = [...prev];
      [newUsers[index + 1], newUsers[index]] = [
        newUsers[index],
        newUsers[index + 1],
      ];
      return newUsers;
    });
  };

  const handleTeamDragStart = (e: React.DragEvent, index: number) => {
    setDraggedTeamIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleTeamDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedTeamIndex !== null && draggedTeamIndex !== index) {
      setDragOverTeamIndex(index);
    }
  };

  const handleTeamDragLeave = () => {
    setDragOverTeamIndex(null);
  };

  const handleTeamDragEnd = () => {
    setDraggedTeamIndex(null);
    setDragOverTeamIndex(null);
  };

  const handleTeamDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const draggedIdxStr = e.dataTransfer.getData("text/plain");
    if (!draggedIdxStr) {
      handleTeamDragEnd();
      return;
    }
    const draggedIdx = parseInt(draggedIdxStr, 10);
    if (draggedIdx === index) {
      handleTeamDragEnd();
      return;
    }

    setManualTeams((prev) => {
      return reorderContestEntries(prev, draggedIdx, index);
    });

    handleTeamDragEnd();
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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Create a room</h2>
          <button type="button" onClick={onClose} className={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <form
            id="create-room-form"
            onSubmit={handleSubmit}
            className={styles.form}
            spellCheck={false}
          >
            {isHead && (
              <div className={styles.templateBox}>
                <label className={styles.templateLabel} htmlFor="top-preset-id">
                  Load from Template (Optional)
                </label>
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
              </div>
            )}

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
                    setFormData({ ...formData, mode: e.target.value })
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
                  onChange={(e) =>
                    setFormData({ ...formData, format: e.target.value })
                  }
                  disabled={!!topPresetId}
                  className={`${styles.formInput} ${styles.formSelect}`}
                >
                  <option value="1v1">1v1</option>
                  <option value="solo-tournament">Solo Tournament</option>
                  <option value="team-tournament">Team Battle</option>
                  <option value="bracket">Bracket (Knockout)</option>
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
                  Max Participants
                </label>
                <input
                  required
                  id="max-participants"
                  type="number"
                  min={formData.format === "team-tournament" ? 6 : 2}
                  step={formData.format === "team-tournament" ? 3 : 1}
                  value={
                    Number.isNaN(formData.maxParticipants)
                      ? ""
                      : formData.maxParticipants
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      maxParticipants: parseInt(e.target.value),
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

                <div
                  className={`${styles.field} ${
                    topPresetId ? styles.locked : ""
                  }`}
                >
                  <label className={styles.label} htmlFor="preset-id">
                    Match Preset
                  </label>
                  <select
                    id="preset-id"
                    value={formData.presetId}
                    onChange={(e) =>
                      setFormData({ ...formData, presetId: e.target.value })
                    }
                    disabled={!!topPresetId}
                    className={`${styles.formInput} ${styles.formSelect}`}
                  >
                    <option value="" disabled>
                      Select a preset...
                    </option>
                    <option value="custom">
                      Custom (Manual Configuration)
                    </option>
                    {presets.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className={styles.hint}>
                    Bracket tournaments use presets to define the problem
                    criteria for all rounds.
                  </span>
                  {(() => {
                    const selectedMatchPreset = presets.find(
                      (p) => p._id === formData.presetId,
                    );
                    return selectedMatchPreset ? (
                      <div className={styles.presetInfo}>
                        <span className={styles.presetInfoName}>
                          {selectedMatchPreset.name}
                        </span>
                        {selectedMatchPreset.description && (
                          <span>{selectedMatchPreset.description}</span>
                        )}
                        <div className={styles.presetInfoMeta}>
                          <span>• {selectedMatchPreset.mode}</span>
                          {selectedMatchPreset.problemSelectionMode ===
                          "bulk" ? (
                            <span>
                              • {selectedMatchPreset.bulkProblemCount} problems
                              ({selectedMatchPreset.bulkRatingMin}-
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
                </div>

                {formData.presetId === "custom" && renderProblemConfiguration()}

                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="seeding-method">
                      Seeding Method
                    </label>
                    <select
                      id="seeding-method"
                      value={formData.seedingMethod}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "manual") {
                          setFormData({
                            ...formData,
                            seedingMethod: val,
                            registrationType: "closed",
                          });
                        } else {
                          setFormData({ ...formData, seedingMethod: val });
                        }
                      }}
                      className={`${styles.formInput} ${styles.formSelect}`}
                    >
                      <option value="cf_rating">
                        Codeforces Rating (Average)
                      </option>
                      <option value="manual">Manual Seeding</option>
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={formData.thirdPlacePlayoff}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            thirdPlacePlayoff: e.target.checked,
                          })
                        }
                        className={styles.checkbox}
                      />
                      <span>Third Place Playoff</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* New Scheduled Registration Section */}
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
                        registrationType: e.target.value,
                      })
                    }
                    disabled={
                      formData.format === "bracket" &&
                      formData.seedingMethod === "manual"
                    }
                    className={`${styles.formInput} ${styles.formSelect}`}
                  >
                    <option value="open">Open (Public)</option>
                    <option value="closed">Closed (Manual Registration)</option>
                  </select>
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
              </div>

              {formData.registrationType !== "closed" &&
                formData.registrationStartMode === "schedule" && (
                  <div className={styles.regSub}>
                    <label className={styles.label}>
                      Registration Start Time
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
                        <div
                          key={team.id}
                          draggable={formData.seedingMethod === "manual"}
                          onDragStart={(e) => handleTeamDragStart(e, teamIndex)}
                          onDragOver={(e) => handleTeamDragOver(e, teamIndex)}
                          onDragLeave={handleTeamDragLeave}
                          onDragEnd={handleTeamDragEnd}
                          onDrop={(e) => handleTeamDrop(e, teamIndex)}
                          className={`${styles.teamCard} ${
                            formData.seedingMethod === "manual"
                              ? styles.teamCardDraggable
                              : ""
                          } ${
                            draggedTeamIndex === teamIndex
                              ? styles.dragging
                              : dragOverTeamIndex === teamIndex
                                ? styles.dragOver
                                : ""
                          }`}
                        >
                          <div className={styles.teamCardHeader}>
                            <div className={styles.teamNameWrap}>
                              {formData.seedingMethod === "manual" && (
                                <>
                                  <GripVertical
                                    className={styles.dragHandle}
                                    size={18}
                                  />
                                  <span className={styles.seedNum}>
                                    #{teamIndex + 1}
                                  </span>
                                </>
                              )}
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
                                  {member.image ? (
                                    <CompatibleImage
                                      src={member.image}
                                      alt={member.name}
                                      className={styles.avatarSm}
                                      width={24}
                                      height={24}
                                    />
                                  ) : (
                                    <div className={styles.avatarFallback}>
                                      {member.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
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
                                          {user.image ? (
                                            <CompatibleImage
                                              src={user.image}
                                              alt={user.name}
                                              className={styles.avatarSm}
                                              width={24}
                                              height={24}
                                            />
                                          ) : (
                                            <div
                                              className={styles.avatarFallback}
                                            >
                                              {user.name
                                                .charAt(0)
                                                .toUpperCase()}
                                            </div>
                                          )}
                                          <div className={styles.searchUserCol}>
                                            <div
                                              className={styles.searchUserTop}
                                            >
                                              <span
                                                className={
                                                  styles.searchUserName
                                                }
                                              >
                                                {getDisplayName(
                                                  user.name,
                                                  user.pizza_count,
                                                )}
                                              </span>
                                              <span
                                                className={
                                                  styles.searchSepInline
                                                }
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
                                              className={
                                                styles.searchUserHandle
                                              }
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
                            value={
                              activeSearchTeamId === null ? searchQuery : ""
                            }
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
                                    {user.image ? (
                                      <CompatibleImage
                                        src={user.image}
                                        alt={user.name}
                                        className={styles.avatarSm}
                                        width={24}
                                        height={24}
                                      />
                                    ) : (
                                      <div className={styles.avatarFallback}>
                                        {user.name.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div className={styles.searchUserCol}>
                                      <div className={styles.searchUserTop}>
                                        <span className={styles.searchUserName}>
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
                      {formData.seedingMethod === "manual" ? (
                        <div className={styles.soloList}>
                          {registeredUsers.map((u, index) => (
                            <div
                              key={u.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, index)}
                              onDragOver={(e) => handleDragOver(e, index)}
                              onDragLeave={handleDragLeave}
                              onDragEnd={handleDragEnd}
                              onDrop={(e) => handleDrop(e, index)}
                              className={`${styles.soloRow} ${
                                draggedUserIndex === index
                                  ? styles.dragging
                                  : dragOverIndex === index
                                    ? styles.dragOver
                                    : ""
                              }`}
                            >
                              <div className={styles.soloInfo}>
                                <GripVertical
                                  className={styles.dragHandle}
                                  size={18}
                                />
                                <span className={styles.seedNum}>
                                  #{index + 1}
                                </span>
                                {u.image ? (
                                  <CompatibleImage
                                    src={u.image}
                                    alt={u.name}
                                    className={styles.avatarMd}
                                    width={32}
                                    height={32}
                                  />
                                ) : (
                                  <div className={styles.avatarFallbackLg}>
                                    {u.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className={styles.soloUserCol}>
                                  <div className={styles.searchUserTop}>
                                    <span className={styles.searchUserName}>
                                      {getDisplayName(u.name, u.pizza_count)}
                                    </span>
                                    <span className={styles.searchSepInline}>
                                      |
                                    </span>
                                    <span
                                      className={`${styles.searchUserRating} ${getRatingClass(
                                        u.cfRating,
                                      )}`}
                                    >
                                      {u.cfRating || "Unrated"}
                                    </span>
                                  </div>
                                  <span className={styles.searchUserHandle}>
                                    {u.cfHandle}
                                  </span>
                                </div>
                              </div>
                              <div className={styles.memberInfo}>
                                <button
                                  type="button"
                                  onClick={() => removeUser(u.id)}
                                  className={styles.iconBtnMuted}
                                >
                                  <X className={styles.icon18} size={18} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.chipList}>
                          {registeredUsers.map((u) => (
                            <div key={u.id} className={styles.chip}>
                              {u.image ? (
                                <CompatibleImage
                                  src={u.image}
                                  alt={u.name}
                                  className={styles.avatarSm}
                                  width={24}
                                  height={24}
                                />
                              ) : (
                                <div className={styles.avatarFallback}>
                                  {u.name.charAt(0).toUpperCase()}
                                </div>
                              )}
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
                      )}
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
                Match Start Time
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
                <div className={styles.timeAddRow}>
                  {[3, 5, 10, 15].map((mins) => (
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
              </div>
              <span className={styles.hint}>
                Scheduled rooms start automatically. Registration deadline will
                be exactly 1 minute before the start time for all users.
              </span>
            </div>
          </form>
        </div>

        <div className={styles.footer}>
          <button type="button" onClick={onClose} className={styles.cancelBtn}>
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
            className={styles.submitBtn}
          >
            {loading ? "Creating..." : "Create Room"}
          </button>
        </div>
      </div>
    </div>
  );
}
