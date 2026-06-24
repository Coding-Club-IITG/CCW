import styles from "../ContestWizard.module.scss";

interface Step5Props {
  formData: any;
  presets: any[];
}

export default function Step5Preview({ formData, presets }: Step5Props) {
  const selectedPreset = presets.find((p) => p._id === formData.presetId);

  return (
    <div>
      <h2 style={{ marginBottom: "1.5rem", fontSize: "1.25rem", color: "var(--foreground-strong)" }}>
        Step 5: Review & Create Tournament
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.875rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "0.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
          <span style={{ color: "var(--muted)" }}>Tournament Name:</span>
          <strong style={{ color: "var(--foreground-strong)" }}>{formData.name}</strong>

          {formData.description && (
            <>
              <span style={{ color: "var(--muted)" }}>Description:</span>
              <span style={{ color: "var(--foreground)", whiteSpace: "pre-line" }}>{formData.description}</span>
            </>
          )}

          <span style={{ color: "var(--muted)" }}>Format:</span>
          <strong style={{ color: "var(--foreground)" }}>Bracket (Knockout)</strong>

          <span style={{ color: "var(--muted)" }}>Match Mode:</span>
          <strong style={{ color: "var(--foreground)", textTransform: "capitalize" }}>{formData.mode}</strong>

          <span style={{ color: "var(--muted)" }}>Team Size:</span>
          <strong style={{ color: "var(--foreground)" }}>{formData.teamSize === 3 ? "Trio (3v3)" : "Solo (1v1)"}</strong>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "0.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
          <span style={{ color: "var(--muted)" }}>Registration:</span>
          <strong style={{ color: "var(--foreground)", textTransform: "capitalize" }}>{formData.registrationType}</strong>

          <span style={{ color: "var(--muted)" }}>Deadline:</span>
          <strong style={{ color: "var(--foreground)" }}>
            {formData.deadline ? new Date(formData.deadline).toLocaleString() : "Not Set"}
          </strong>

          <span style={{ color: "var(--muted)" }}>Max Participants:</span>
          <strong style={{ color: "var(--foreground)" }}>{formData.maxParticipants}</strong>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "0.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
          <span style={{ color: "var(--muted)" }}>Match Preset:</span>
          <strong style={{ color: "var(--foreground-strong)" }}>{selectedPreset?.name || "None"}</strong>

          {selectedPreset && (
            <>
              <span style={{ color: "var(--muted)" }}>Match Duration:</span>
              <strong style={{ color: "var(--foreground)" }}>
                {Math.round((selectedPreset.durationSeconds || 0) / 60)} minutes
              </strong>

              <span style={{ color: "var(--muted)" }}>Problem Selection:</span>
              <strong style={{ color: "var(--foreground)" }}>
                {selectedPreset.problemSelectionMode === "bulk"
                  ? `Bulk (${selectedPreset.bulkProblemCount} problems from ${selectedPreset.bulkPlatform}, rating ${selectedPreset.bulkRatingMin}-${selectedPreset.bulkRatingMax})`
                  : `Fine-tuned slots (${selectedPreset.problemSlots?.map((s: any) => s.rating).join(", ")})`}
              </strong>
            </>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "0.5rem" }}>
          <span style={{ color: "var(--muted)" }}>Bronze Playoff:</span>
          <strong style={{ color: "var(--foreground)" }}>{formData.thirdPlacePlayoff ? "Enabled" : "Disabled"}</strong>

          <span style={{ color: "var(--muted)" }}>Seeding:</span>
          <strong style={{ color: "var(--foreground)", textTransform: "capitalize" }}>
            {formData.seedingMethod === "cf_rating" ? "Auto Codeforces Rating" : "Manual"}
          </strong>
        </div>
      </div>
    </div>
  );
}
