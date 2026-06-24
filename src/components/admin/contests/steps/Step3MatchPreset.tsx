import styles from "../ContestWizard.module.scss";

interface Step3Props {
  presets: any[];
  selectedPresetId: string;
  updateFields: (fields: any) => void;
  errors: Record<string, string>;
}

export default function Step3MatchPreset({
  presets,
  selectedPresetId,
  updateFields,
  errors,
}: Step3Props) {
  const selectedPreset = presets.find((p) => p._id === selectedPresetId);

  return (
    <div>
      <h2 style={{ marginBottom: "1.5rem", fontSize: "1.25rem", color: "var(--foreground-strong)" }}>
        Step 3: Select Match Preset
      </h2>

      {errors.presetId && (
        <div style={{ color: "var(--danger)", fontSize: "0.875rem", marginBottom: "1rem" }}>{errors.presetId}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "250px", overflowY: "auto", paddingRight: "0.5rem", marginBottom: "1.5rem" }}>
        {presets.map((preset) => (
          <label
            key={preset._id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.75rem",
              border: selectedPresetId === preset._id ? "2px solid var(--primary)" : "1px solid var(--border)",
              borderRadius: "6px",
              background: "var(--surface)",
              cursor: "pointer",
              transition: "border-color 0.15s ease",
            }}
          >
            <input
              type="radio"
              name="presetId"
              checked={selectedPresetId === preset._id}
              onChange={() => updateFields({ presetId: preset._id })}
              style={{ marginTop: "0.2rem" }}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--foreground-strong)" }}>
                {preset.name}
              </span>
              {preset.description && (
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                  {preset.description}
                </span>
              )}
            </div>
          </label>
        ))}
      </div>

      {selectedPreset && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "1rem",
          }}
        >
          <h3 style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.75rem", color: "var(--foreground-strong)" }}>
            Preset Details: {selectedPreset.name}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 1rem", fontSize: "0.8125rem" }}>
            <div>
              <span style={{ color: "var(--muted)" }}>Format:</span>{" "}
              <strong style={{ color: "var(--foreground)" }}>{selectedPreset.format}</strong>
            </div>
            <div>
              <span style={{ color: "var(--muted)" }}>Mode:</span>{" "}
              <strong style={{ color: "var(--foreground)" }}>{selectedPreset.mode}</strong>
            </div>
            <div>
              <span style={{ color: "var(--muted)" }}>Duration:</span>{" "}
              <strong style={{ color: "var(--foreground)" }}>
                {Math.round((selectedPreset.durationSeconds || 0) / 60)} minutes
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--muted)" }}>Selection:</span>{" "}
              <strong style={{ color: "var(--foreground)" }}>{selectedPreset.problemSelectionMode}</strong>
            </div>
            {selectedPreset.problemSelectionMode === "bulk" ? (
              <>
                <div>
                  <span style={{ color: "var(--muted)" }}>Platform:</span>{" "}
                  <strong style={{ color: "var(--foreground)" }}>{selectedPreset.bulkPlatform}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Rating Range:</span>{" "}
                  <strong style={{ color: "var(--foreground)" }}>
                    {selectedPreset.bulkRatingMin} - {selectedPreset.bulkRatingMax}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Count:</span>{" "}
                  <strong style={{ color: "var(--foreground)" }}>{selectedPreset.bulkProblemCount}</strong>
                </div>
              </>
            ) : (
              <div style={{ gridColumn: "span 2" }}>
                <span style={{ color: "var(--muted)" }}>Problem Ratings:</span>{" "}
                <strong style={{ color: "var(--foreground)" }}>
                  {selectedPreset.problemSlots?.map((s: any) => s.rating).join(", ")}
                </strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
