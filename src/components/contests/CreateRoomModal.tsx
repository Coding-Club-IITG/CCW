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
import styles from "./CreateRoomModal.module.scss";

export default function CreateRoomModal({
  isOpen,
  onClose,
  isAdmin = false,
  presets = [],
  deadlineMinutes = 1,
}: {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
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

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    mode: "blitz",
    format: "solo-tournament",
    teamSize: 1,
    maxParticipants: 16,
    startTime: "",
    problemSelectionMode: "bulk",
    bulkRatingMin: 800,
    bulkRatingMax: 1200,
    bulkProblemCount: 3,
    bulkMinContestId: 0,
    fineTunedProblemCount: 1 as string | number,
    fineTunedProblems: [""] as string[],
    presetId: "",
    thirdPlacePlayoff: false,
    seedingMethod: "cf_rating",

    registrationStartMode: "immediate",
    registrationStartTime: "",
    registrationType: "open",
  });

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
      } catch (err) {
        console.error("Search error", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, registeredUsers]);

  useEffect(() => {
    let newTeamSize = formData.teamSize;
    let newMaxPart = formData.maxParticipants;

    if (formData.format === "1v1") {
      newTeamSize = 1;
      newMaxPart = 2;
    } else if (formData.format === "solo-tournament") {
      newTeamSize = 1;
      newMaxPart = 16;
    } else if (formData.format === "team-tournament") {
      newTeamSize = 3;
      newMaxPart = 15;
    } else if (formData.format === "bracket") {
      if (newMaxPart < 2) newMaxPart = 16;
    }

    if (
      newTeamSize !== formData.teamSize ||
      newMaxPart !== formData.maxParticipants
    ) {
      setFormData((prev) => ({
        ...prev,
        teamSize: newTeamSize,
        maxParticipants: newMaxPart,
      }));
    }
  }, [formData.format]);

  const handleTopPresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setTopPresetId(id);

    if (!id) return;

    const preset = presets.find((p) => p._id === id);
    if (preset) {
      setFormData((prev) => ({
        ...prev,
        name: preset.name || prev.name,
        description: preset.description || prev.description,
        mode: preset.mode || prev.mode,
        format: preset.format || prev.format,
        problemSelectionMode:
          preset.problemSelectionMode || prev.problemSelectionMode,
        bulkRatingMin: preset.bulkRatingMin || prev.bulkRatingMin,
        bulkRatingMax: preset.bulkRatingMax || prev.bulkRatingMax,
        bulkProblemCount: preset.bulkProblemCount || prev.bulkProblemCount,
        bulkMinContestId: preset.bulkMinContestId ?? prev.bulkMinContestId,
        fineTunedProblems:
          preset.problemSlots && preset.problemSlots.length > 0
            ? preset.problemSlots.map((s: any) => s.problemId || "")
            : prev.fineTunedProblems,
        fineTunedProblemCount:
          preset.problemSlots && preset.problemSlots.length > 0
            ? preset.problemSlots.length
            : prev.fineTunedProblemCount,
        presetId: preset.format === "bracket" ? id : prev.presetId,
      }));
    }
  };

  const [maxPartError, setMaxPartError] = useState("");
  const [fineTunedCountError, setFineTunedCountError] = useState("");
  useEffect(() => {
    if (Number.isNaN(formData.maxParticipants)) {
      setMaxPartError("Must be a valid number.");
      return;
    }
    if (formData.format === "solo-tournament" && formData.maxParticipants < 2) {
      setMaxPartError("At least 2 participants required.");
      return;
    }
    if (formData.format === "team-tournament") {
      if (formData.maxParticipants < 6) {
        setMaxPartError("At least 6 participants required (2 teams).");
        return;
      }
    }
    if (formData.format === "bracket") {
      if (formData.maxParticipants < 2) {
        setMaxPartError("At least 2 participants required.");
        return;
      }
    }

    const isTeamsUI = true;
    const perTeamLimit = formData.teamSize;
    if (isTeamsUI) {
      const maxTeamsAllowed = Math.floor(
        formData.maxParticipants / perTeamLimit,
      );
      if (manualTeams.length > maxTeamsAllowed) {
        setMaxPartError(
          `Cannot be less than currently registered teams (${manualTeams.length}).`,
        );
        return;
      }
    }

    setMaxPartError("");
  }, [
    formData.maxParticipants,
    formData.format,
    formData.teamSize,
    manualTeams.length,
    registeredUsers.length,
  ]);

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

  const [draggedUserIndex, setDraggedUserIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
      const result = [...prev];
      const [removed] = result.splice(draggedIdx, 1);
      result.splice(index, 0, removed);
      return result;
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

  const [draggedTeamIndex, setDraggedTeamIndex] = useState<number | null>(null);
  const [dragOverTeamIndex, setDragOverTeamIndex] = useState<number | null>(
    null,
  );

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
      const result = [...prev];
      const [removed] = result.splice(draggedIdx, 1);
      result.splice(index, 0, removed);
      return result;
    });

    handleTeamDragEnd();
  };

  const renderProblemConfiguration = () => (
    <div
      className={`${styles.sectionBlock} ${topPresetId ? styles.locked : ""}`}
    >
      <div className={styles.sectionTitleRow}>
        <h3 className={styles.sectionHeading}>Problem Configuration</h3>
        {!!topPresetId && (
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
          value={formData.problemSelectionMode}
          onChange={(e) =>
            setFormData({ ...formData, problemSelectionMode: e.target.value })
          }
          disabled={!!topPresetId}
          className={`${styles.formInput} ${styles.formSelect}`}
        >
          <option value="test">Test</option>
          <option value="bulk">Bulk</option>
          <option value="fine-tuned">Fine-Tuned</option>
        </select>
        {formData.problemSelectionMode === "test" && (
          <span className={styles.hint}>
            A pre-selected test problem will be assigned to verify the room
            mechanics.
          </span>
        )}
        {formData.problemSelectionMode === "bulk" && (
          <span className={styles.hint}>
            Automatically fetch problems unsolved by all registered players,
            selected based on their rating range.
          </span>
        )}
        {formData.problemSelectionMode === "fine-tuned" && (
          <span className={styles.hint}>
            Manually curate and select exactly which problems will be included
            in the room.
          </span>
        )}
      </div>

      {formData.problemSelectionMode === "bulk" && (
        <div className={styles.grid3}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="min-rating">
              Min Rating
            </label>
            <input
              required={formData.problemSelectionMode === "bulk"}
              id="min-rating"
              type="number"
              step={100}
              value={
                Number.isNaN(formData.bulkRatingMin)
                  ? ""
                  : formData.bulkRatingMin
              }
              onChange={(e) =>
                setFormData({
                  ...formData,
                  bulkRatingMin: parseInt(e.target.value),
                })
              }
              disabled={!!topPresetId}
              className={styles.formInput}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="max-rating">
              Max Rating
            </label>
            <input
              required={formData.problemSelectionMode === "bulk"}
              id="max-rating"
              type="number"
              step={100}
              value={
                Number.isNaN(formData.bulkRatingMax)
                  ? ""
                  : formData.bulkRatingMax
              }
              onChange={(e) =>
                setFormData({
                  ...formData,
                  bulkRatingMax: parseInt(e.target.value),
                })
              }
              disabled={!!topPresetId}
              className={styles.formInput}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="problem-count">
              Count
            </label>
            <input
              required={formData.problemSelectionMode === "bulk"}
              id="problem-count"
              type="number"
              min={1}
              max={10}
              value={
                Number.isNaN(formData.bulkProblemCount)
                  ? ""
                  : formData.bulkProblemCount
              }
              onChange={(e) =>
                setFormData({
                  ...formData,
                  bulkProblemCount: parseInt(e.target.value),
                })
              }
              disabled={!!topPresetId}
              className={styles.formInput}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="bulk-min-contest">
              Contest Release Date
            </label>
            <select
              id="bulk-min-contest"
              value={formData.bulkMinContestId}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  bulkMinContestId: Number(e.target.value),
                })
              }
              disabled={!!topPresetId}
              className={styles.formInput}
            >
              {CF_CONTEST_YEAR_OPTIONS.map((opt) => (
                <option key={opt.minContestId} value={opt.minContestId}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {formData.problemSelectionMode === "fine-tuned" &&
        formData.format !== "bracket" && (
          <div className={styles.fineTunedBlock}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="fine-tuned-count">
                Number of Problems
              </label>
              <input
                required={formData.problemSelectionMode === "fine-tuned"}
                id="fine-tuned-count"
                type="number"
                min={1}
                max={10}
                value={formData.fineTunedProblemCount}
                onChange={(e) => {
                  const valStr = e.target.value;
                  const isValid = /^[1-9]\d*$/.test(valStr);
                  const count = parseInt(valStr, 10);

                  if (isValid && count >= 1 && count <= 10) {
                    setFineTunedCountError("");
                    const newProblems = [...formData.fineTunedProblems];
                    while (newProblems.length < count) newProblems.push("");
                    while (newProblems.length > count) newProblems.pop();
                    setFormData({
                      ...formData,
                      fineTunedProblemCount: valStr,
                      fineTunedProblems: newProblems,
                    });
                  } else {
                    setFormData({ ...formData, fineTunedProblemCount: valStr });
                    if (!isValid) {
                      setFineTunedCountError("Must be a positive integer.");
                    } else if (count > 10) {
                      setFineTunedCountError("Must be at most 10.");
                    }
                  }
                }}
                disabled={!!topPresetId}
                className={`${styles.formInput} ${
                  fineTunedCountError ? styles.inputError : ""
                }`}
              />
              {fineTunedCountError && (
                <span className={styles.errorText}>{fineTunedCountError}</span>
              )}
            </div>

            <div className={styles.grid23}>
              {formData.fineTunedProblems.map((prob, idx) => (
                <div key={idx} className={styles.field}>
                  <label className={styles.label} htmlFor={`problem-${idx}`}>
                    Problem {idx + 1}
                  </label>
                  <input
                    required={formData.problemSelectionMode === "fine-tuned"}
                    id={`problem-${idx}`}
                    type="text"
                    placeholder="Eg. 4A"
                    value={prob}
                    onChange={(e) => {
                      const newProblems = [...formData.fineTunedProblems];
                      newProblems[idx] = e.target.value;
                      setFormData({
                        ...formData,
                        fineTunedProblems: newProblems,
                      });
                    }}
                    disabled={!!topPresetId}
                    className={styles.formInput}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Bracket-specific fine-tuned UI: problems grouped by round */}
      {formData.problemSelectionMode === "fine-tuned" &&
        formData.format === "bracket" &&
        (() => {
          const maxP = Math.max(2, formData.maxParticipants || 2);
          const totalRounds = Math.ceil(Math.log2(maxP));
          const ppm = formData.bulkProblemCount || 3; // problems per match

          // Sync bracketRoundProblems structure with computed rounds
          const syncedRounds: { roundNumber: number; problemIds: string[] }[] =
            [];
          for (let r = 1; r <= totalRounds; r++) {
            const matchCount = Math.pow(2, totalRounds - r);
            const needed = matchCount * ppm;
            const existing = bracketRoundProblems.find(
              (x) => x.roundNumber === r,
            );
            const ids = existing ? [...existing.problemIds] : [];
            while (ids.length < needed) ids.push("");
            while (ids.length > needed) ids.pop();
            syncedRounds.push({ roundNumber: r, problemIds: ids });
          }
          if (
            JSON.stringify(syncedRounds) !==
            JSON.stringify(bracketRoundProblems)
          ) {
            // Use setTimeout to avoid updating state during render
            setTimeout(() => setBracketRoundProblems(syncedRounds), 0);
          }

          const getRoundLabel = (r: number) => {
            const matchCount = Math.pow(2, totalRounds - r);
            if (r === totalRounds) return "Final";
            if (r === totalRounds - 1) return "Semi-Finals";
            if (r === totalRounds - 2) return "Quarter-Finals";
            return `Round ${r}`;
          };

          return (
            <div className={styles.roundsList}>
              {syncedRounds.map((rnd) => {
                const matchCount = Math.pow(2, totalRounds - rnd.roundNumber);
                const label = getRoundLabel(rnd.roundNumber);
                return (
                  <div key={rnd.roundNumber} className={styles.roundCard}>
                    <div className={styles.roundHeader}>
                      <span className={styles.roundLabel}>{label}</span>
                      <span className={styles.roundMeta}>
                        {matchCount} match{matchCount > 1 ? "es" : ""} × {ppm}{" "}
                        problems ={" "}
                        <strong>{rnd.problemIds.length} IDs needed</strong>
                      </span>
                    </div>
                    <div className={styles.grid23}>
                      {rnd.problemIds.map((pid, idx) => {
                        const matchNum = Math.floor(idx / ppm) + 1;
                        const probNum = (idx % ppm) + 1;
                        return (
                          <div key={idx} className={styles.roundField}>
                            <label className={styles.roundFieldLabel}>
                              Match {matchNum} · P{probNum}
                            </label>
                            <input
                              required
                              type="text"
                              placeholder="Eg. 4A"
                              value={pid}
                              onChange={(e) => {
                                const updated = syncedRounds.map((r) =>
                                  r.roundNumber === rnd.roundNumber
                                    ? {
                                        ...r,
                                        problemIds: r.problemIds.map((p, i) =>
                                          i === idx ? e.target.value : p,
                                        ),
                                      }
                                    : r,
                                );
                                setBracketRoundProblems(updated);
                              }}
                              className={styles.formInput}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
    </div>
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
            {isAdmin && (
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
                                    <img
                                      src={member.image}
                                      alt={member.name}
                                      className={styles.avatarSm}
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
                                            <img
                                              src={user.image}
                                              alt={user.name}
                                              className={styles.avatarSm}
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
                                      <img
                                        src={user.image}
                                        alt={user.name}
                                        className={styles.avatarSm}
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
                                  <img
                                    src={u.image}
                                    alt={u.name}
                                    className={styles.avatarMd}
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
                                <img
                                  src={u.image}
                                  alt={u.name}
                                  className={styles.avatarSm}
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
