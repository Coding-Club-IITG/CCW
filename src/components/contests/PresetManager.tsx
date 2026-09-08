"use client";

import { Plus, Edit2, Archive, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

import { appErrorMessage, expectAppData } from "@/lib/api/result";
import { CF_CONTEST_YEAR_OPTIONS } from "@/lib/constants";
import type { ContestPresetDto } from "@/lib/contests/dtos";

import Modal from "@/components/shared/Modal";
import { useToast } from "@/components/shared/Toast";
import { useConfirm } from "@/components/shared/useConfirm";

import styles from "./PresetManager.module.scss";

interface PresetManagerProps {
  initialPresets: ContestPresetDto[];
  isAdmin: boolean;
}

export default function PresetManager({
  initialPresets,
  isAdmin,
}: PresetManagerProps) {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [presets, setPresets] = useState<ContestPresetDto[]>(initialPresets);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ContestPresetDto | null>(
    null,
  );

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [format, setFormat] = useState("bracket");
  const [mode, setMode] = useState("blitz");
  const [durationSeconds, setDurationSeconds] = useState(300);

  // New Structural States
  const [overallDurationMinutes, setOverallDurationMinutes] = useState<
    number | ""
  >("");
  const [perProblemDurationMinutes, setPerProblemDurationMinutes] = useState<
    number | ""
  >("");
  const [teamSize, setTeamSize] = useState(1);
  const [spectatorRestriction, setSpectatorRestriction] = useState("none");

  // Registration Settings
  const [regType, setRegType] = useState("open");
  const [maxParticipants, setMaxParticipants] = useState(16);

  // Bracket Settings
  const [bracketType, setBracketType] = useState("single_elimination");
  const [thirdPlacePlayoff, setThirdPlacePlayoff] = useState(false);
  const [seedingMethod, setSeedingMethod] = useState("cf_rating");

  const [problemSelectionMode, setProblemSelectionMode] = useState("bulk");

  // Mode A Bulk Settings
  const [bulkPlatform, setBulkPlatform] = useState("codeforces");
  const [bulkRatingMin, setBulkRatingMin] = useState(800);
  const [bulkRatingMax, setBulkRatingMax] = useState(1200);
  const [bulkProblemCount, setBulkProblemCount] = useState(3);
  const [bulkMinContestId, setBulkMinContestId] = useState(0);

  // Mode B Fine-Tuned Slots
  const [problemSlots, setProblemSlots] = useState<
    Array<{
      platform: string;
      rating: number;
      problemId?: string;
      roundNumber?: number;
      points?: number;
      timeLimitMinutes?: number;
    }>
  >([{ platform: "codeforces", rating: 800, roundNumber: 1 }]);

  function resetForm() {
    setName("");
    setDescription("");
    setIsGlobal(false);
    setFormat("bracket");
    setMode("blitz");
    setDurationSeconds(300);
    setOverallDurationMinutes("");
    setPerProblemDurationMinutes("");
    setTeamSize(1);
    setSpectatorRestriction("none");
    setRegType("open");
    setMaxParticipants(16);
    setBracketType("single_elimination");
    setThirdPlacePlayoff(false);
    setSeedingMethod("cf_rating");

    setProblemSelectionMode("bulk");
    setBulkPlatform("codeforces");
    setBulkRatingMin(800);
    setBulkRatingMax(1200);
    setBulkProblemCount(3);
    setBulkMinContestId(0);
    setProblemSlots([{ platform: "codeforces", rating: 800, roundNumber: 1 }]);
    setEditingPreset(null);
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  function openEdit(preset: ContestPresetDto) {
    setEditingPreset(preset);
    setName(preset.name || "");
    setDescription(preset.description || "");
    setIsGlobal(preset.isGlobal || false);
    setFormat(preset.format || "bracket");
    setMode(preset.mode || "blitz");
    setDurationSeconds(preset.durationSeconds || 300);

    setOverallDurationMinutes(preset.overallDurationMinutes || "");
    setPerProblemDurationMinutes(preset.perProblemDurationMinutes || "");
    setTeamSize(preset.teamSize || 1);
    setSpectatorRestriction(preset.spectatorRestriction || "none");

    setRegType(preset.registrationSettings?.type || "open");
    setMaxParticipants(preset.registrationSettings?.maxParticipants || 16);

    setBracketType(preset.bracketSettings?.type || "single_elimination");
    setThirdPlacePlayoff(preset.bracketSettings?.thirdPlacePlayoff || false);
    setSeedingMethod(preset.bracketSettings?.seedingMethod || "cf_rating");

    setProblemSelectionMode(preset.problemSelectionMode || "bulk");
    setBulkPlatform(preset.bulkPlatform || "codeforces");
    setBulkRatingMin(preset.bulkRatingMin || 800);
    setBulkRatingMax(preset.bulkRatingMax || 1200);
    setBulkProblemCount(preset.bulkProblemCount || 3);
    setBulkMinContestId(preset.bulkMinContestId || 0);

    setProblemSlots(
      preset.problemSlots?.map((slot) => ({
        platform: slot.platform || "codeforces",
        rating: slot.rating || 800,
        problemId: slot.problemId || "",
        roundNumber: slot.roundNumber || 1,
        points: slot.points || 0,
        timeLimitMinutes: slot.timeLimitMinutes || 0,
      })) || [{ platform: "codeforces", rating: 800, roundNumber: 1 }],
    );
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = {
        name,
        description,
        format,
        mode,
        durationSeconds,
        teamSize,
        spectatorRestriction,
        registrationSettings: {
          type: regType,
          maxParticipants,
        },
        bracketSettings:
          format === "bracket"
            ? {
                type: bracketType,
                thirdPlacePlayoff,
                seedingMethod,
              }
            : undefined,
        problemSelectionMode,
        ...(problemSelectionMode === "bulk"
          ? {
              bulkPlatform,
              bulkRatingMin,
              bulkRatingMax,
              bulkProblemCount,
              bulkMinContestId,
            }
          : {
              problemSlots: problemSlots.map((s) => ({
                ...s,
                problemId: s.problemId || undefined,
                points: s.points || undefined,
                timeLimitMinutes: s.timeLimitMinutes || undefined,
              })),
            }),
      };

      if (overallDurationMinutes)
        payload.overallDurationMinutes = overallDurationMinutes;
      if (perProblemDurationMinutes)
        payload.perProblemDurationMinutes = perProblemDurationMinutes;
      if (isAdmin) payload.isGlobal = isGlobal;

      const url = editingPreset
        ? `/api/contests/presets/${editingPreset._id}`
        : `/api/contests/presets`;
      const method = editingPreset ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const savedPreset = await expectAppData<ContestPresetDto>(res);

      if (editingPreset) {
        setPresets(
          presets.map((p) => (p._id === savedPreset._id ? savedPreset : p)),
        );
      } else {
        setPresets(
          [...presets, savedPreset].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );
      }

      setModalOpen(false);
      resetForm();
    } catch (error: unknown) {
      toast.error(appErrorMessage(error, "Unable to save the preset."));
    } finally {
      setLoading(false);
    }
  }

  async function toggleArchive(preset: ContestPresetDto) {
    const confirmed = await confirm({
      title: preset.archived
        ? "Unarchive this preset?"
        : "Archive this preset?",
      description: preset.archived
        ? `"${preset.name}" will be selectable again when creating contests.`
        : `"${preset.name}" will be hidden from contest creation. Existing contests keep their settings.`,
      confirmLabel: preset.archived ? "Unarchive" : "Archive",
      variant: preset.archived ? "primary" : "danger",
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/contests/presets/${preset._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !preset.archived }),
      });

      if (!res.ok) {
        toast.error(appErrorMessage(res, "Failed to update preset."));
        return;
      }
      const updated = await expectAppData<ContestPresetDto>(res);
      setPresets(presets.map((p) => (p._id === updated._id ? updated : p)));
      toast.success(
        `Preset ${updated.archived ? "archived" : "unarchived"} successfully.`,
      );
    } catch (error: unknown) {
      toast.error(appErrorMessage(error, "Unable to update the preset."));
    } finally {
      setLoading(false);
    }
  }

  async function deletePreset(preset: ContestPresetDto) {
    const confirmed = await confirm({
      title: "Delete this preset?",
      description: `"${preset.name}" will be permanently deleted. This action cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    const res = await fetch(`/api/contests/presets/${preset._id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      toast.error(appErrorMessage(res, "Failed to delete preset."));
      return;
    }
    setPresets(presets.filter((p) => p._id !== preset._id));
    toast.success("Preset deleted successfully.");
  }

  function addSlot() {
    setProblemSlots([
      ...problemSlots,
      { platform: "codeforces", rating: 800, roundNumber: 1 },
    ]);
  }

  function updateSlot(index: number, field: string, value: string | number) {
    const updated = [...problemSlots];
    updated[index] = { ...updated[index], [field]: value };
    setProblemSlots(updated);
  }

  function removeSlot(index: number) {
    if (problemSlots.length <= 1) return;
    setProblemSlots(problemSlots.filter((_, i) => i !== index));
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          onClick={openCreate}
          className={styles.addButton}
          disabled={loading}
        >
          <Plus size={16} /> New Preset
        </button>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Format</th>
              <th>Mode</th>
              <th>Visibility</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {presets.map((preset) => (
              <tr
                key={preset._id}
                className={preset.archived ? styles.archivedRow : ""}
              >
                <td>
                  <strong>{preset.name}</strong>
                  {preset.description && (
                    <p className={styles.description}>{preset.description}</p>
                  )}
                </td>
                <td>{preset.format}</td>
                <td>{preset.mode}</td>
                <td>
                  {preset.isGlobal ? (
                    <span className={`${styles.badge} ${styles.badgeActive}`}>
                      Global
                    </span>
                  ) : (
                    <span className={`${styles.badge}`}>Private</span>
                  )}
                </td>
                <td>
                  <span
                    className={`${styles.badge} ${preset.archived ? styles.badgeArchived : styles.badgeActive}`}
                  >
                    {preset.archived ? "Archived" : "Active"}
                  </span>
                </td>
                <td>
                  <div className={styles.actions}>
                    <button
                      onClick={() => openEdit(preset)}
                      className={styles.actionButton}
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => toggleArchive(preset)}
                      className={`${styles.actionButton} ${preset.archived ? styles.unarchiveBtn : styles.archiveBtn}`}
                      title={preset.archived ? "Restore" : "Archive"}
                    >
                      <Archive size={14} />
                    </button>
                    <button
                      onClick={() => deletePreset(preset)}
                      className={`${styles.actionButton} ${styles.deleteBtn}`}
                      title="Delete Permanently"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal
          kicker="Presets"
          title={editingPreset ? "Edit preset" : "New preset"}
          onClose={() => setModalOpen(false)}
          closeDisabled={loading}
          maxWidth={900}
          footer={
            <>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className={styles.cancelBtn}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="preset-form"
                className={styles.primaryBtn}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className={styles.spinner} size={16} />
                ) : (
                  "Save Preset"
                )}
              </button>
            </>
          }
        >
          <form id="preset-form" onSubmit={handleSubmit}>
            <div className={styles.row}>
              <div className={styles.field} style={{ flex: 2 }}>
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Eg. Global Qualifier Tournament"
                  required
                />
              </div>
              {isAdmin && (
                <div className={styles.field} style={{ flex: 1 }}>
                  <label>Global Preset?</label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginTop: "0.5rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isGlobal}
                      onChange={(e) => setIsGlobal(e.target.checked)}
                    />
                    Available to everyone
                  </label>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label>Description (Optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details about this preset..."
              />
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label>Format</label>
                <select
                  value={format}
                  onChange={(e) => {
                    const newFormat = e.target.value;
                    setFormat(newFormat);
                    if (newFormat === "1v1" || newFormat === "solo-tournament") {
                      setTeamSize(1);
                    } else if (newFormat === "team-tournament" && teamSize === 1) {
                      setTeamSize(3);
                    }
                  }}
                >
                  <option value="bracket">Bracket</option>
                  <option value="1v1">1v1</option>
                  <option value="solo-tournament">Solo Tournament</option>
                  <option value="team-tournament">Team Tournament</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>Mode</label>
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="blitz">Blitz</option>
                  <option value="arena">Arena</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>Team Size</label>
                <select
                  value={["1v1", "solo-tournament"].includes(format) ? 1 : teamSize}
                  onChange={(e) => setTeamSize(Number(e.target.value))}
                  disabled={["1v1", "solo-tournament"].includes(format)}
                >
                  <option value={1}>1 Player (Solo)</option>
                  <option value={3}>3 Players</option>
                </select>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label>Spectator Policy</label>
                <select
                  value={spectatorRestriction}
                  onChange={(e) => setSpectatorRestriction(e.target.value)}
                >
                  <option value="none">No Spectators</option>
                  <option value="all">Any Authenticated User</option>
                  <option value="club_members">Club / Module Members</option>
                  <option value="admin_creator">Admins & Creator Only</option>
                </select>
              </div>
            </div>

            {format === "bracket" && (
              <fieldset
                style={{
                  border: "1px solid #ddd",
                  padding: "1rem",
                  marginBottom: "1rem",
                  borderRadius: "4px",
                }}
              >
                <legend style={{ padding: "0 0.5rem", fontWeight: "bold" }}>
                  Bracket Settings
                </legend>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>Bracket Type</label>
                    <select
                      value={bracketType}
                      onChange={(e) => setBracketType(e.target.value)}
                    >
                      <option value="single_elimination">
                        Single Elimination
                      </option>
                      <option value="double_elimination">
                        Double Elimination
                      </option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Seeding Method</label>
                    <select
                      value={seedingMethod}
                      onChange={(e) => setSeedingMethod(e.target.value)}
                    >
                      <option value="cf_rating">CF Rating (Automatic)</option>
                      <option value="manual">Manual Seeding</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Third Place Playoff?</label>
                    <select
                      value={thirdPlacePlayoff ? "yes" : "no"}
                      onChange={(e) =>
                        setThirdPlacePlayoff(e.target.value === "yes")
                      }
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                </div>
              </fieldset>
            )}

            <fieldset
              style={{
                border: "1px solid #ddd",
                padding: "1rem",
                marginBottom: "1rem",
                borderRadius: "4px",
              }}
            >
              <legend style={{ padding: "0 0.5rem", fontWeight: "bold" }}>
                Registration Settings
              </legend>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>Registration Type</label>
                  <select
                    value={regType}
                    onChange={(e) => setRegType(e.target.value)}
                  >
                    <option value="open">Open Registration</option>
                    <option value="closed">Closed (Invite Only)</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Max Participants / Teams</label>
                  <input
                    type="number"
                    value={maxParticipants}
                    onChange={(e) => setMaxParticipants(Number(e.target.value))}
                    min={2}
                    required
                  />
                </div>
              </div>
            </fieldset>

            <fieldset
              style={{
                border: "1px solid #ddd",
                padding: "1rem",
                marginBottom: "1rem",
                borderRadius: "4px",
              }}
            >
              <legend style={{ padding: "0 0.5rem", fontWeight: "bold" }}>
                Time Settings
              </legend>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>
                    Match Duration (Secs)
                    <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "normal", marginTop: "0.25rem" }}>
                      Max time for a single head-to-head match
                    </span>
                  </label>
                  <input
                    type="number"
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(Number(e.target.value))}
                    min={60}
                    required
                  />
                </div>
                {format !== "1v1" && (
                  <div className={styles.field}>
                    <label>
                      Overall Duration (Mins)
                      <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "normal", marginTop: "0.25rem" }}>
                        Total time for the entire tournament/event
                      </span>
                    </label>
                    <input
                      type="number"
                      value={overallDurationMinutes}
                      onChange={(e) =>
                        setOverallDurationMinutes(Number(e.target.value) || "")
                      }
                      placeholder="Optional"
                    />
                  </div>
                )}
                <div className={styles.field}>
                  <label>
                    Per Problem (Mins)
                    <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "normal", marginTop: "0.25rem" }}>
                      Recommended time spent per problem
                    </span>
                  </label>
                  <input
                    type="number"
                    value={perProblemDurationMinutes}
                    onChange={(e) =>
                      setPerProblemDurationMinutes(Number(e.target.value) || "")
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
            </fieldset>

            <div className={styles.field}>
              <label>Problem Selection Mode</label>
              <select
                value={problemSelectionMode}
                onChange={(e) => setProblemSelectionMode(e.target.value)}
              >
                <option value="bulk">Bulk (Automatic query)</option>
                <option value="fine-tuned">
                  Fine-Tuned (Manual slots / per round)
                </option>
              </select>
            </div>

            {problemSelectionMode === "bulk" ? (
              <div
                className={styles.bulkSection}
                style={{
                  background: "var(--bg-hover, rgba(255, 255, 255, 0.05))",
                  padding: "1rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                }}
              >
                <div className={styles.field}>
                  <label>Platform</label>
                  <select
                    value={bulkPlatform}
                    onChange={(e) => setBulkPlatform(e.target.value)}
                  >
                    <option value="codeforces">Codeforces</option>
                  </select>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>Min Rating</label>
                    <input
                      type="number"
                      value={bulkRatingMin}
                      onChange={(e) => setBulkRatingMin(Number(e.target.value))}
                      min={800}
                      max={3500}
                      step={100}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Max Rating</label>
                    <input
                      type="number"
                      value={bulkRatingMax}
                      onChange={(e) => setBulkRatingMax(Number(e.target.value))}
                      min={800}
                      max={3500}
                      step={100}
                    />
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Problem Count</label>
                  <input
                    type="number"
                    value={bulkProblemCount}
                    onChange={(e) =>
                      setBulkProblemCount(Number(e.target.value))
                    }
                    min={1}
                    max={10}
                  />
                </div>
                <div className={styles.field}>
                  <label>Contest Release Date</label>
                  <select
                    value={bulkMinContestId}
                    onChange={(e) =>
                      setBulkMinContestId(Number(e.target.value))
                    }
                  >
                    {CF_CONTEST_YEAR_OPTIONS.map((opt) => (
                      <option key={opt.minContestId} value={opt.minContestId}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div
                className={styles.fineTunedSection}
                style={{
                  background: "var(--bg-hover, rgba(255, 255, 255, 0.05))",
                  padding: "1rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                }}
              >
                <label
                  style={{
                    fontWeight: "bold",
                    display: "block",
                    marginBottom: "0.5rem",
                  }}
                >
                  Problem Slots
                </label>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  {problemSlots.map((slot, index) => (
                    <div
                      key={index}
                      className={styles.row}
                      style={{
                        alignItems: "flex-end",
                        flexWrap: "wrap",
                        background: "var(--bg-card)",
                        padding: "0.5rem",
                        borderRadius: "4px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {format === "bracket" && (
                        <div
                          className={styles.field}
                          style={{ marginBottom: 0, flex: 1 }}
                        >
                          <label style={{ fontSize: "0.8rem" }}>
                            Rnd (Bracket)
                          </label>
                          <input
                            type="number"
                            value={slot.roundNumber}
                            onChange={(e) =>
                              updateSlot(
                                index,
                                "roundNumber",
                                Number(e.target.value),
                              )
                            }
                            min={1}
                          />
                        </div>
                      )}
                      <div
                        className={styles.field}
                        style={{ marginBottom: 0, flex: 2 }}
                      >
                        <label style={{ fontSize: "0.8rem" }}>Platform</label>
                        <select
                          value={slot.platform}
                          onChange={(e) =>
                            updateSlot(index, "platform", e.target.value)
                          }
                        >
                          <option value="codeforces">Codeforces</option>
                        </select>
                      </div>
                      <div
                        className={styles.field}
                        style={{ marginBottom: 0, flex: 2 }}
                      >
                        <label style={{ fontSize: "0.8rem" }}>Rating</label>
                        <input
                          type="number"
                          value={slot.rating}
                          onChange={(e) =>
                            updateSlot(index, "rating", Number(e.target.value))
                          }
                          step={100}
                        />
                      </div>
                      <div
                        className={styles.field}
                        style={{ marginBottom: 0, flex: 2 }}
                      >
                        <label style={{ fontSize: "0.8rem" }}>
                          Specific ID
                        </label>
                        <input
                          type="text"
                          value={slot.problemId || ""}
                          onChange={(e) =>
                            updateSlot(index, "problemId", e.target.value)
                          }
                          placeholder="e.g. 1912A"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSlot(index)}
                        disabled={problemSlots.length <= 1}
                        className={styles.removeSlotBtn}
                        style={{ height: "38px", flexShrink: 0 }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addSlot}
                  className={styles.addSlotBtn}
                >
                  + Add Slot
                </button>
              </div>
            )}
          </form>
        </Modal>
      )}
      {confirmDialog}
    </div>
  );
}
