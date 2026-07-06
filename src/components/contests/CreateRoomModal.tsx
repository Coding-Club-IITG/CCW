"use client";

import { useState, useEffect } from "react";
import { createRoomContest } from "@/lib/actions/contests";
import {
  createBracketContest,
  searchVerifiedUsers,
} from "@/lib/actions/admin/contests";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

const getRatingColor = (rating: number | undefined) => {
  if (!rating) return "#808080";
  if (rating < 1200) return "#808080";
  if (rating < 1400) return "#008000";
  if (rating < 1600) return "#03a89e";
  if (rating < 1900) return "#0000ff";
  if (rating < 2100) return "#aa00aa";
  if (rating < 2400) return "#ff8c00";
  return "#ff0000";
};

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
    // E.g., if deadlineMinutes is 1, minimum wait is (1 + 1) = 2 mins.
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
        if (res.error) {
          alert(res.error);
        } else {
          onClose();
          router.refresh();
        }
      } catch (err: any) {
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
      className={`mt-[16px] pt-[16px] border-t border-outline-variant flex flex-col gap-[16px] ${!!topPresetId ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-headline-lg-mobile text-headline-lg-mobile md:text-[24px] text-on-surface m-0">
          Problem Configuration
        </h3>
        {!!topPresetId && (
          <span
            className="material-symbols-outlined text-[18px] text-on-surface-variant"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            lock
          </span>
        )}
      </div>

      <div className="flex flex-col gap-unit">
        <label
          className="font-label-sm text-label-sm text-on-surface-variant"
          htmlFor="problem-selection-mode"
        >
          Selection Mode
        </label>
        <select
          id="problem-selection-mode"
          value={formData.problemSelectionMode}
          onChange={(e) =>
            setFormData({ ...formData, problemSelectionMode: e.target.value })
          }
          disabled={!!topPresetId}
          className={`form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none ${!!topPresetId ? "cursor-not-allowed" : "cursor-pointer"}`}
        >
          <option value="test">Test</option>
          <option value="bulk">Bulk</option>
          <option value="fine-tuned">Fine-Tuned</option>
        </select>
        {formData.problemSelectionMode === "test" && (
          <span className="font-label-sm text-label-sm text-primary mt-1">
            A pre-selected test problem will be assigned to verify the room
            mechanics.
          </span>
        )}
        {formData.problemSelectionMode === "bulk" && (
          <span className="font-label-sm text-label-sm text-primary mt-1">
            Automatically fetch problems unsolved by all registered players,
            selected based on their rating range.
          </span>
        )}
        {formData.problemSelectionMode === "fine-tuned" && (
          <span className="font-label-sm text-label-sm text-primary mt-1">
            Manually curate and select exactly which problems will be included
            in the room.
          </span>
        )}
      </div>

      {formData.problemSelectionMode === "bulk" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[16px]">
          <div className="flex flex-col gap-unit">
            <label
              className="font-label-sm text-label-sm text-on-surface-variant"
              htmlFor="min-rating"
            >
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
              className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
            />
          </div>
          <div className="flex flex-col gap-unit">
            <label
              className="font-label-sm text-label-sm text-on-surface-variant"
              htmlFor="max-rating"
            >
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
              className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
            />
          </div>
          <div className="flex flex-col gap-unit">
            <label
              className="font-label-sm text-label-sm text-on-surface-variant"
              htmlFor="problem-count"
            >
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
              className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
            />
          </div>
        </div>
      )}

      {formData.problemSelectionMode === "fine-tuned" &&
        formData.format !== "bracket" && (
          <div className="flex flex-col gap-[16px] mt-2">
            <div className="flex flex-col gap-unit">
              <label
                className="font-label-sm text-label-sm text-on-surface-variant"
                htmlFor="fine-tuned-count"
              >
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
                className={`form-input rounded-lg w-full md:w-1/3 px-[12px] py-[8px] focus:outline-none transition-shadow ${fineTunedCountError ? "border-error focus:border-error focus:shadow-[0_0_0_1px_rgba(255,180,171,1)]" : ""}`}
              />
              {fineTunedCountError && (
                <span className="text-[11px] font-label-sm text-error mt-1">
                  {fineTunedCountError}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[16px]">
              {formData.fineTunedProblems.map((prob, idx) => (
                <div key={idx} className="flex flex-col gap-unit">
                  <label
                    className="font-label-sm text-label-sm text-on-surface-variant"
                    htmlFor={`problem-${idx}`}
                  >
                    Problem {idx + 1}
                  </label>
                  <input
                    required={formData.problemSelectionMode === "fine-tuned"}
                    id={`problem-${idx}`}
                    type="text"
                    placeholder="e.g. 4A"
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
                    className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
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
            <div className="flex flex-col gap-[24px] mt-2">
              {syncedRounds.map((rnd) => {
                const matchCount = Math.pow(2, totalRounds - rnd.roundNumber);
                const label = getRoundLabel(rnd.roundNumber);
                return (
                  <div
                    key={rnd.roundNumber}
                    className="flex flex-col gap-[12px] p-3 rounded-lg border border-outline-variant bg-surface-container-low"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-sm font-semibold text-on-surface">
                        {label}
                      </span>
                      <span className="font-label-sm text-[11px] text-on-surface-variant">
                        {matchCount} match{matchCount > 1 ? "es" : ""} × {ppm}{" "}
                        problems ={" "}
                        <strong>{rnd.problemIds.length} IDs needed</strong>
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[8px]">
                      {rnd.problemIds.map((pid, idx) => {
                        const matchNum = Math.floor(idx / ppm) + 1;
                        const probNum = (idx % ppm) + 1;
                        return (
                          <div key={idx} className="flex flex-col gap-[2px]">
                            <label className="font-label-sm text-[11px] text-on-surface-variant">
                              Match {matchNum} · P{probNum}
                            </label>
                            <input
                              required
                              type="text"
                              placeholder="e.g. 4A"
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
                              className="form-input rounded-lg w-full px-[10px] py-[6px] focus:outline-none transition-shadow text-sm"
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
    <div
      className="fixed inset-0 flex items-center justify-center p-margin-mobile md:p-margin-desktop bg-black/60 backdrop-grayscale overflow-y-auto text-on-surface font-body-md"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl mx-auto bg-surface-container border border-outline-variant rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        style={{ maxWidth: "672px", zIndex: 10000 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-gutter py-[16px] border-b border-outline-variant">
          <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface m-0">
            Create a room
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-unit rounded hover:bg-surface-variant"
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontVariationSettings:
                  "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
              }}
            >
              close
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-gutter custom-scrollbar">
          <form
            id="create-room-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-[16px]"
            spellCheck={false}
          >
            {isAdmin && (
              <div className="flex flex-col gap-unit bg-primary/5 p-4 rounded-lg border border-primary/20 mb-2">
                <label
                  className="font-label-sm text-label-sm text-primary font-medium"
                  htmlFor="top-preset-id"
                >
                  Load from Template (Optional)
                </label>
                <select
                  id="top-preset-id"
                  value={topPresetId}
                  onChange={handleTopPresetChange}
                  className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none cursor-pointer mt-1"
                >
                  <option value="">No template (Manual setup)</option>
                  {presets.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="font-label-sm text-[11px] text-on-surface-variant mt-1">
                  Selecting a template will auto-fill and lock the configuration
                  below.
                </span>
              </div>
            )}

            <div className="flex flex-col gap-unit">
              <label
                className="font-label-sm text-label-sm text-on-surface-variant"
                htmlFor="room-name"
              >
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
                className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
              />
            </div>

            <div className="flex flex-col gap-unit">
              <label
                className="font-label-sm text-label-sm text-on-surface-variant"
                htmlFor="room-description"
              >
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
                className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow resize-none h-[80px]"
                maxLength={500}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
              <div className="flex flex-col gap-unit">
                <label
                  className="font-label-sm text-label-sm text-on-surface-variant"
                  htmlFor="room-mode"
                >
                  Mode
                </label>
                <select
                  id="room-mode"
                  value={formData.mode}
                  onChange={(e) =>
                    setFormData({ ...formData, mode: e.target.value })
                  }
                  disabled={!!topPresetId}
                  className={`form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none ${!!topPresetId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <option value="blitz">Blitz</option>
                  <option value="arena">Arena</option>
                </select>
              </div>
              <div className="flex flex-col gap-unit">
                <label
                  className="font-label-sm text-label-sm text-on-surface-variant"
                  htmlFor="room-format"
                >
                  Format
                </label>
                <select
                  id="room-format"
                  value={formData.format}
                  onChange={(e) =>
                    setFormData({ ...formData, format: e.target.value })
                  }
                  disabled={!!topPresetId}
                  className={`form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none ${!!topPresetId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <option value="1v1">1v1</option>
                  <option value="solo-tournament">Solo Tournament</option>
                  <option value="team-tournament">Team Battle</option>
                  {isAdmin && (
                    <option value="bracket">Bracket (Knockout)</option>
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
              <div className="flex flex-col gap-unit">
                <label
                  className="font-label-sm text-label-sm text-on-surface-variant"
                  htmlFor="team-size"
                >
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
                  className={`form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none ${isTeamSizeLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <option value={1}>1 Player (Solo)</option>
                  <option value={3}>3 Players (ICPC)</option>
                </select>
              </div>
              <div className="flex flex-col gap-unit">
                <label
                  className="font-label-sm text-label-sm text-on-surface-variant"
                  htmlFor="max-participants"
                >
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
                  className={`form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow ${isMaxPartLocked ? "opacity-50 cursor-not-allowed" : ""} ${maxPartError ? "border-error focus:border-error focus:shadow-[0_0_0_1px_rgba(255,180,171,1)]" : ""}`}
                />
                {maxPartError && (
                  <span className="text-[11px] font-label-sm text-error mt-1">
                    {maxPartError}
                  </span>
                )}
              </div>
            </div>

            {formData.format !== "bracket" && renderProblemConfiguration()}

            {formData.format === "bracket" && (
              <div className="mt-[16px] pt-[16px] border-t border-outline-variant flex flex-col gap-[16px]">
                <div className="flex items-center gap-2">
                  <h3 className="font-headline-lg-mobile text-headline-lg-mobile md:text-[24px] text-on-surface m-0">
                    Bracket Settings
                  </h3>
                  {!!topPresetId && (
                    <span
                      className="material-symbols-outlined text-[18px] text-on-surface-variant"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      lock
                    </span>
                  )}
                </div>

                <div
                  className={`flex flex-col gap-unit ${!!topPresetId ? "opacity-60 pointer-events-none" : ""}`}
                >
                  <label
                    className="font-label-sm text-label-sm text-on-surface-variant"
                    htmlFor="preset-id"
                  >
                    Match Preset
                  </label>
                  <select
                    id="preset-id"
                    value={formData.presetId}
                    onChange={(e) =>
                      setFormData({ ...formData, presetId: e.target.value })
                    }
                    disabled={!!topPresetId}
                    className={`form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none ${!!topPresetId ? "cursor-not-allowed" : "cursor-pointer"}`}
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
                  <span className="font-label-sm text-label-sm text-primary mt-1">
                    Bracket tournaments use presets to define the problem
                    criteria for all rounds.
                  </span>
                  {(() => {
                    const selectedMatchPreset = presets.find(
                      (p) => p._id === formData.presetId,
                    );
                    return selectedMatchPreset ? (
                      <div className="mt-2 p-3 bg-surface-variant/30 rounded-lg border border-outline-variant/50 text-xs text-on-surface-variant flex flex-col gap-1">
                        <span className="font-semibold text-on-surface">
                          {selectedMatchPreset.name}
                        </span>
                        {selectedMatchPreset.description && (
                          <span>{selectedMatchPreset.description}</span>
                        )}
                        <div className="flex gap-3 mt-1 opacity-80">
                          <span className="capitalize">
                            • {selectedMatchPreset.mode}
                          </span>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                  <div className="flex flex-col gap-unit">
                    <label
                      className="font-label-sm text-label-sm text-on-surface-variant"
                      htmlFor="seeding-method"
                    >
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
                      className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none cursor-pointer"
                    >
                      <option value="cf_rating">
                        Codeforces Rating (Average)
                      </option>
                      <option value="manual">Manual Seeding</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-unit justify-center">
                    <label className="flex items-center gap-unit cursor-pointer mt-4">
                      <input
                        type="checkbox"
                        checked={formData.thirdPlacePlayoff}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            thirdPlacePlayoff: e.target.checked,
                          })
                        }
                        className="form-checkbox text-primary rounded border-outline-variant bg-background focus:ring-primary focus:ring-offset-surface-container focus:ring-offset-2 w-5 h-5 transition-colors"
                      />
                      <span className="font-label-sm text-label-sm text-on-surface">
                        Third Place Playoff
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* New Scheduled Registration Section */}
            <div className="mt-4 p-4 border border-outline-variant rounded-lg bg-surface-container-low flex flex-col gap-4">
              <h4 className="font-label-md text-on-surface mb-2 border-b border-outline-variant pb-2">
                Registration Window
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                <div className="flex flex-col gap-unit">
                  <label className="font-label-sm text-label-sm text-on-surface-variant">
                    Registration Type
                  </label>
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
                    className={`form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none ${formData.format === "bracket" && formData.seedingMethod === "manual" ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <option value="open">Open (Public)</option>
                    <option value="closed">Closed (Manual Registration)</option>
                  </select>
                </div>

                {formData.registrationType !== "closed" && (
                  <div className="flex flex-col gap-unit">
                    <label className="font-label-sm text-label-sm text-on-surface-variant">
                      Registration Starts
                    </label>
                    <select
                      value={formData.registrationStartMode}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          registrationStartMode: e.target.value,
                        })
                      }
                      className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none cursor-pointer"
                    >
                      <option value="immediate">Immediately</option>
                      <option value="schedule">Schedule Start</option>
                    </select>
                  </div>
                )}
              </div>

              {formData.registrationType !== "closed" &&
                formData.registrationStartMode === "schedule" && (
                  <div className="flex flex-col gap-unit mt-2">
                    <label className="font-label-sm text-label-sm text-on-surface-variant">
                      Registration Start Time
                    </label>
                    <div className="flex flex-col gap-[8px]">
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
                        className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow [color-scheme:dark]"
                      />
                      <div className="flex items-center gap-[8px] mt-2">
                        <button
                          type="button"
                          onClick={() => handleRegTimeAdd(3)}
                          className="px-3 py-1 bg-surface-variant rounded text-[12px] hover:bg-primary/20"
                        >
                          +3m
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegTimeAdd(15)}
                          className="px-3 py-1 bg-surface-variant rounded text-[12px] hover:bg-primary/20"
                        >
                          +15m
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegTimeAdd(60)}
                          className="px-3 py-1 bg-surface-variant rounded text-[12px] hover:bg-primary/20"
                        >
                          +1h
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              {formData.registrationType === "closed" && (
                <div className="flex flex-col gap-unit mt-2 border-t border-outline-variant pt-4">
                  <label className="font-label-sm text-label-sm text-on-surface-variant">
                    {useTeamsUI ? "Add Teams" : "Add Participants"}
                  </label>

                  {useTeamsUI ? (
                    <div className="flex flex-col gap-4">
                      {manualTeams.map((team, teamIndex) => (
                        <div
                          key={team.id}
                          draggable={formData.seedingMethod === "manual"}
                          onDragStart={(e) => handleTeamDragStart(e, teamIndex)}
                          onDragOver={(e) => handleTeamDragOver(e, teamIndex)}
                          onDragLeave={handleTeamDragLeave}
                          onDragEnd={handleTeamDragEnd}
                          onDrop={(e) => handleTeamDrop(e, teamIndex)}
                          className={`flex flex-col gap-2 p-3 bg-surface-container-high border rounded-lg transition-all duration-200 ${
                            formData.seedingMethod === "manual"
                              ? "cursor-grab active:cursor-grabbing hover:border-primary/50"
                              : "border-outline-variant"
                          } ${
                            draggedTeamIndex === teamIndex
                              ? "opacity-40 scale-[0.98]"
                              : dragOverTeamIndex === teamIndex
                                ? "border-primary border-t-2 bg-primary/10 shadow-lg"
                                : "border-outline-variant"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 group border-b border-transparent hover:border-outline-variant focus-within:border-outline-variant transition-colors pb-0.5">
                              {formData.seedingMethod === "manual" && (
                                <>
                                  <span className="material-symbols-outlined text-on-surface-variant/50 cursor-grab active:cursor-grabbing pointer-events-none">
                                    drag_indicator
                                  </span>
                                  <span className="font-bold text-on-surface-variant w-6 text-center text-[12px] pointer-events-none">
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
                                className="bg-transparent border-none focus:outline-none focus:ring-0 text-on-surface font-semibold text-[16px] px-1 py-0.5 max-w-[180px]"
                                placeholder="Team Name"
                              />
                              <span className="material-symbols-outlined text-[16px] text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                edit
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setManualTeams(
                                  manualTeams.filter((t) => t.id !== team.id),
                                )
                              }
                              className="text-error/80 hover:text-error hover:bg-error/10 p-1 rounded transition-colors flex items-center justify-center"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                delete
                              </span>
                            </button>
                          </div>

                          <div className="flex flex-col gap-2 mt-1">
                            {team.members.map((member) => (
                              <div
                                key={member.id}
                                className="flex items-center justify-between p-2 bg-surface-variant rounded border border-outline-variant/50"
                              >
                                <div className="flex items-center gap-2">
                                  {member.image ? (
                                    <img
                                      src={member.image}
                                      alt={member.name}
                                      className="w-6 h-6 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                                      {member.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <span className="text-sm text-on-surface">
                                    {member.name}
                                  </span>
                                  <span className="text-outline-variant text-[12px]">
                                    |
                                  </span>
                                  <span
                                    className="text-sm font-bold"
                                    style={{
                                      color: getRatingColor(member.cfRating),
                                    }}
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
                                  className="text-on-surface-variant hover:text-error hover:bg-error/10 p-1 rounded transition-colors flex items-center justify-center"
                                >
                                  <span className="material-symbols-outlined text-[16px]">
                                    close
                                  </span>
                                </button>
                              </div>
                            ))}

                            {team.members.length < membersPerTeamLimit && (
                              <div className="relative mt-1">
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
                                  className="form-input rounded-lg w-full px-[14px] py-[12px] focus:outline-none transition-shadow text-[15px]"
                                />
                                {activeSearchTeamId === team.id &&
                                  isSearching && (
                                    <div className="absolute right-3 top-2.5">
                                      <span
                                        className="material-symbols-outlined animate-spin text-on-surface-variant text-[18px]"
                                        style={{
                                          fontVariationSettings:
                                            "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                                        }}
                                      >
                                        refresh
                                      </span>
                                    </div>
                                  )}
                                {activeSearchTeamId === team.id &&
                                  searchQuery.length >= 2 &&
                                  searchResults.length > 0 && (
                                    <div className="absolute z-50 w-full mt-1 bg-surface-container-high border border-outline-variant rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                      {searchResults.map((user, index) => (
                                        <div
                                          key={user.id}
                                          className={`flex items-center gap-3 p-2 hover:bg-surface-variant cursor-pointer transition-colors ${index === selectedUserIndex ? "bg-surface-variant" : ""}`}
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
                                              className="w-6 h-6 rounded-full object-cover"
                                            />
                                          ) : (
                                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                                              {user.name
                                                .charAt(0)
                                                .toUpperCase()}
                                            </div>
                                          )}
                                          <div className="flex flex-col">
                                            <div className="flex items-center">
                                              <span className="text-[14px] font-medium text-on-surface leading-tight">
                                                {user.name}
                                              </span>
                                              <span className="text-outline-variant mx-2 text-[12px]">
                                                |
                                              </span>
                                              <span
                                                className="text-[14px] font-bold leading-tight"
                                                style={{
                                                  color: getRatingColor(
                                                    user.cfRating,
                                                  ),
                                                }}
                                              >
                                                {user.cfRating || "Unrated"}
                                              </span>
                                            </div>
                                            <span className="text-[11px] text-on-surface-variant leading-tight mt-0.5">
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
                        className={`w-full py-2 bg-surface-variant text-on-surface-variant rounded border border-outline-variant transition-colors font-label-md flex items-center justify-center gap-2 mt-2 ${manualTeams.length >= Math.floor(formData.maxParticipants / membersPerTeamLimit) ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-variant/80 hover:text-on-surface"}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          add
                        </span>
                        Add Team{" "}
                        {manualTeams.length >=
                          Math.floor(
                            formData.maxParticipants / membersPerTeamLimit,
                          ) && "(Max Limit Reached)"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(formData.format !== "1v1" ||
                        registeredUsers.length < 2) && (
                        <div className="relative">
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
                            className="form-input rounded-lg w-full px-[14px] py-[12px] focus:outline-none transition-shadow text-[15px]"
                          />
                          {activeSearchTeamId === null && isSearching && (
                            <div className="absolute right-3 top-2.5">
                              <span
                                className="material-symbols-outlined animate-spin text-on-surface-variant"
                                style={{
                                  fontVariationSettings:
                                    "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                                }}
                              >
                                refresh
                              </span>
                            </div>
                          )}
                          {activeSearchTeamId === null &&
                            searchQuery.length >= 2 &&
                            searchResults.length > 0 && (
                              <div className="absolute z-50 w-full mt-1 bg-surface-container-high border border-outline-variant rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {searchResults.map((user, index) => (
                                  <div
                                    key={user.id}
                                    className={`flex items-center gap-3 p-2 hover:bg-surface-variant cursor-pointer transition-colors ${index === selectedUserIndex ? "bg-surface-variant" : ""}`}
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
                                        className="w-6 h-6 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                                        {user.name.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div className="flex flex-col">
                                      <div className="flex items-center">
                                        <span className="text-[14px] font-medium text-on-surface leading-tight">
                                          {user.name}
                                        </span>
                                        <span className="text-outline-variant mx-2 text-[12px]">
                                          |
                                        </span>
                                        <span
                                          className="text-[14px] font-bold leading-tight"
                                          style={{
                                            color: getRatingColor(
                                              user.cfRating,
                                            ),
                                          }}
                                        >
                                          {user.cfRating || "Unrated"}
                                        </span>
                                      </div>
                                      <span className="text-[11px] text-on-surface-variant leading-tight mt-0.5">
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
                        <div className="flex flex-col gap-2 mt-3">
                          {registeredUsers.map((u, index) => (
                            <div
                              key={u.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, index)}
                              onDragOver={(e) => handleDragOver(e, index)}
                              onDragLeave={handleDragLeave}
                              onDragEnd={handleDragEnd}
                              onDrop={(e) => handleDrop(e, index)}
                              className={`flex items-center justify-between p-2 rounded-lg border transition-all duration-200 cursor-grab active:cursor-grabbing ${
                                draggedUserIndex === index
                                  ? "opacity-40 scale-[0.98]"
                                  : dragOverIndex === index
                                    ? "border-primary border-t-2 bg-primary/10 shadow-lg"
                                    : "bg-surface-variant border-outline-variant hover:border-primary/50"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-on-surface-variant/50 cursor-grab active:cursor-grabbing pointer-events-none">
                                  drag_indicator
                                </span>
                                <span className="font-bold text-on-surface-variant w-6 text-center text-[12px] pointer-events-none">
                                  #{index + 1}
                                </span>
                                {u.image ? (
                                  <img
                                    src={u.image}
                                    alt={u.name}
                                    className="w-8 h-8 rounded-full object-cover pointer-events-none"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[12px] font-bold pointer-events-none">
                                    {u.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="flex flex-col pointer-events-none">
                                  <div className="flex items-center">
                                    <span className="text-[14px] font-medium text-on-surface">
                                      {u.name}
                                    </span>
                                    <span className="text-outline-variant mx-2 text-[12px]">
                                      |
                                    </span>
                                    <span
                                      className="text-[14px] font-bold"
                                      style={{
                                        color: getRatingColor(u.cfRating),
                                      }}
                                    >
                                      {u.cfRating || "Unrated"}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-on-surface-variant leading-tight mt-0.5">
                                    {u.cfHandle}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => removeUser(u.id)}
                                  className="p-1 text-error hover:bg-error/10 rounded ml-2 flex items-center justify-center relative z-10"
                                >
                                  <span className="material-symbols-outlined text-[18px]">
                                    close
                                  </span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-3 mt-4">
                          {registeredUsers.map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center bg-surface-variant border border-outline-variant rounded-full pl-2 pr-1 py-1.5 shadow-sm"
                            >
                              {u.image ? (
                                <img
                                  src={u.image}
                                  alt={u.name}
                                  className="w-6 h-6 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                                  {u.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex items-center px-3">
                                <span className="text-[14px] font-medium text-on-surface">
                                  {u.name}
                                </span>
                                <span className="text-outline-variant mx-2 text-[12px]">
                                  |
                                </span>
                                <span
                                  className="text-[14px] font-bold"
                                  style={{ color: getRatingColor(u.cfRating) }}
                                >
                                  {u.cfRating || "Unrated"}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeUser(u.id)}
                                className="text-on-surface-variant hover:text-error hover:bg-error/10 rounded-full p-1 flex items-center justify-center transition-colors ml-1"
                              >
                                <span
                                  className="material-symbols-outlined text-[16px]"
                                  style={{
                                    fontVariationSettings:
                                      "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                                  }}
                                >
                                  close
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  <span className="font-label-sm text-[11px] text-on-surface-variant mt-1">
                    These members will be automatically registered when the
                    contest begins.
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-unit mt-6 pt-4 border-t border-outline-variant">
              <label
                className="font-label-sm text-label-sm text-on-surface-variant"
                htmlFor="start-time"
              >
                Match Start Time
              </label>
              <div className="flex flex-col gap-[12px]">
                <input
                  required
                  id="start-time"
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) =>
                    setFormData({ ...formData, startTime: e.target.value })
                  }
                  className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow [color-scheme:dark]"
                />
                <div className="flex items-center justify-center gap-[16px] flex-wrap mt-4 mb-2 w-full">
                  {[3, 5, 10, 15].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleTimeAdd(mins)}
                      className="px-8 py-3 bg-transparent border-2 border-dashed border-primary/40 text-on-surface rounded-lg font-label-sm text-[15px] font-medium hover:bg-primary/10 hover:border-primary/70 hover:text-primary transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      +{mins} min{mins > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </div>
              <span className="font-label-sm text-label-sm text-primary mt-1">
                Scheduled rooms start automatically. Registration deadline will
                be exactly 1 minute before the start time for all users.
              </span>
            </div>
          </form>
        </div>

        <div className="flex items-center justify-end gap-[16px] px-gutter py-[16px] border-t border-outline-variant bg-surface-container">
          <button
            type="button"
            onClick={onClose}
            className="font-label-sm text-label-sm text-on-surface px-[24px] py-[12px] rounded-lg border border-transparent hover:border-outline-variant hover:bg-surface-variant transition-all focus:outline-none focus:ring-2 focus:ring-primary"
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
            className="font-label-sm text-label-sm bg-primary-container text-on-primary-container px-[24px] py-[12px] rounded-lg hover:bg-primary hover:text-on-primary transition-colors shadow-[0_0_15px_rgba(46,125,50,0.3)] hover:shadow-[0_0_20px_rgba(136,217,130,0.5)] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface-container disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Room"}
          </button>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .form-input {
            background-color: #131313 !important;
            border: 1px solid #40493d !important;
            color: #e5e2e1 !important;
        }
        .form-input:focus {
            border-color: #88d982 !important;
            box-shadow: 0 0 0 1px #88d982 !important;
            color: #e5e2e1 !important;
        }
        .form-input:-webkit-autofill,
        .form-input:-webkit-autofill:hover, 
        .form-input:-webkit-autofill:focus, 
        .form-input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px #131313 inset !important;
            -webkit-text-fill-color: #e5e2e1 !important;
            transition: background-color 5000s ease-in-out 0s;
        }
        .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #353534;
            border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #40493d;
        }
      `,
        }}
      />
    </div>
  );
}
