"use client";

import Modal from "@/components/shared/Modal";
import { appErrorMessage, expectAppData } from "@/lib/api/result";
import type { ContestPresetDto } from "@/lib/contests/dtos";

import { useState } from "react";
import { Plus, Edit2, Archive, Loader2 } from "lucide-react";
import { CF_CONTEST_YEAR_OPTIONS } from "@/lib/constants";
import styles from "./PresetManager.module.scss";

interface PresetManagerProps {
  initialPresets: ContestPresetDto[];
}

export default function PresetManager({ initialPresets }: PresetManagerProps) {
  const [presets, setPresets] = useState<ContestPresetDto[]>(initialPresets);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ContestPresetDto | null>(
    null,
  );

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState("bracket");
  const [mode, setMode] = useState("blitz");
  const [durationSeconds, setDurationSeconds] = useState(300);
  const [problemSelectionMode, setProblemSelectionMode] = useState("bulk");

  // Mode A Bulk Settings
  const [bulkPlatform, setBulkPlatform] = useState("codeforces");
  const [bulkRatingMin, setBulkRatingMin] = useState(800);
  const [bulkRatingMax, setBulkRatingMax] = useState(1200);
  const [bulkProblemCount, setBulkProblemCount] = useState(3);
  const [bulkMinContestId, setBulkMinContestId] = useState(0);

  // Mode B Fine-Tuned Slots
  const [problemSlots, setProblemSlots] = useState<
    Array<{ platform: string; rating: number }>
  >([{ platform: "codeforces", rating: 800 }]);

  function resetForm() {
    setName("");
    setDescription("");
    setFormat("bracket");
    setMode("blitz");
    setDurationSeconds(300);
    setProblemSelectionMode("bulk");
    setBulkPlatform("codeforces");
    setBulkRatingMin(800);
    setBulkRatingMax(1200);
    setBulkProblemCount(3);
    setBulkMinContestId(0);
    setProblemSlots([{ platform: "codeforces", rating: 800 }]);
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
    setFormat(preset.format || "bracket");
    setMode(preset.mode || "blitz");
    setDurationSeconds(preset.durationSeconds || 300);
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
      })) || [{ platform: "codeforces", rating: 800 }],
    );
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name,
        description,
        format,
        mode,
        durationSeconds,
        problemSelectionMode,
        ...(problemSelectionMode === "bulk"
          ? {
              bulkPlatform,
              bulkRatingMin,
              bulkRatingMax,
              bulkProblemCount,
              bulkMinContestId,
            }
          : { problemSlots }),
      };

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
      alert(appErrorMessage(error, "Unable to save the preset."));
    } finally {
      setLoading(false);
    }
  }

  async function toggleArchive(preset: ContestPresetDto) {
    const action = preset.archived ? "unarchive" : "archive";
    if (!confirm(`Are you sure you want to ${action} this preset?`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/contests/presets/${preset._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !preset.archived }),
      });

      const updated = await expectAppData<ContestPresetDto>(res);
      setPresets(presets.map((p) => (p._id === updated._id ? updated : p)));
    } catch (error: unknown) {
      alert(appErrorMessage(error, "Unable to update the preset."));
    } finally {
      setLoading(false);
    }
  }

  function addSlot() {
    setProblemSlots([...problemSlots, { platform: "codeforces", rating: 800 }]);
  }

  function updateSlot(
    index: number,
    field: "platform" | "rating",
    value: string | number,
  ) {
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
              <th>Duration (min)</th>
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
                <td>{Math.round((preset.durationSeconds || 0) / 60)}</td>
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
          maxWidth={500}
          footer={
            <>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className={styles.cancelButton}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="preset-form"
                className={styles.saveButton}
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
            <div className={styles.field}>
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Eg. Blitz 5min Easy"
                required
              />
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
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="bracket">Bracket (Knockout)</option>
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
            </div>

            <div className={styles.field}>
              <label>Duration (Seconds)</label>
              <input
                type="number"
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
                min={60}
                required
              />
            </div>

            <div className={styles.field}>
              <label>Problem Selection Mode</label>
              <select
                value={problemSelectionMode}
                onChange={(e) => setProblemSelectionMode(e.target.value)}
              >
                <option value="bulk">Bulk (Automatic query)</option>
                <option value="fine-tuned">
                  Fine-Tuned (Manual rating slots)
                </option>
              </select>
            </div>

            {problemSelectionMode === "bulk" ? (
              <div className={styles.bulkSection}>
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
              <div className={styles.fineTunedSection}>
                <label>Problem Slots</label>
                {problemSlots.map((slot, index) => (
                  <div key={index} className={styles.slotRow}>
                    <select
                      value={slot.platform}
                      onChange={(e) =>
                        updateSlot(index, "platform", e.target.value)
                      }
                    >
                      <option value="codeforces">Codeforces</option>
                    </select>
                    <input
                      type="number"
                      value={slot.rating}
                      onChange={(e) =>
                        updateSlot(index, "rating", Number(e.target.value))
                      }
                      min={800}
                      max={3500}
                      step={100}
                      placeholder="Rating"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(index)}
                      disabled={problemSlots.length <= 1}
                      className={styles.removeSlotBtn}
                    >
                      Remove
                    </button>
                  </div>
                ))}
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
    </div>
  );
}
