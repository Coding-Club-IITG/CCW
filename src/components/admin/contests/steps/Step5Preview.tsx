import styles from "../ContestWizard.module.scss";
import type {
  AdminContestWizardForm,
  ContestCreationPreset,
} from "@/components/contests/contestCreationForm";

interface Step5Props {
  formData: AdminContestWizardForm;
  presets: ContestCreationPreset[];
}

export default function Step5Preview({ formData, presets }: Step5Props) {
  const selectedPreset = presets.find((p) => p._id === formData.presetId);

  return (
    <div>
      <h2 className={styles.stepTitle}>Step 5: Review & Create Tournament</h2>

      <div className={styles.previewList}>
        <div className={styles.previewSection}>
          <span className={styles.previewLabel}>Tournament Name:</span>
          <strong className={styles.previewValueStrong}>{formData.name}</strong>

          {formData.description && (
            <>
              <span className={styles.previewLabel}>Description:</span>
              <span
                className={`${styles.previewValue} ${styles.previewValuePre}`}
              >
                {formData.description}
              </span>
            </>
          )}

          <span className={styles.previewLabel}>Format:</span>
          <strong className={styles.previewValue}>Bracket (Knockout)</strong>

          <span className={styles.previewLabel}>Match Mode:</span>
          <strong
            className={`${styles.previewValue} ${styles.previewValueCap}`}
          >
            {formData.mode}
          </strong>

          <span className={styles.previewLabel}>Team Size:</span>
          <strong className={styles.previewValue}>
            {formData.teamSize === 3 ? "Trio (3v3)" : "Solo (1v1)"}
          </strong>
        </div>

        <div className={styles.previewSection}>
          <span className={styles.previewLabel}>Registration:</span>
          <strong
            className={`${styles.previewValue} ${styles.previewValueCap}`}
          >
            {formData.registrationType}
          </strong>

          <span className={styles.previewLabel}>Max Participants:</span>
          <strong className={styles.previewValue}>
            {formData.maxParticipants}
          </strong>
        </div>

        <div className={styles.previewSection}>
          <span className={styles.previewLabel}>Match Preset:</span>
          <strong className={styles.previewValueStrong}>
            {selectedPreset?.name || "None"}
          </strong>

          {selectedPreset && (
            <>
              <span className={styles.previewLabel}>Match Duration:</span>
              <strong className={styles.previewValue}>
                {Math.round((selectedPreset.durationSeconds || 0) / 60)} minutes
              </strong>

              <span className={styles.previewLabel}>Problem Selection:</span>
              <strong className={styles.previewValue}>
                {selectedPreset.problemSelectionMode === "bulk"
                  ? `Bulk (${selectedPreset.bulkProblemCount} problems from ${selectedPreset.bulkPlatform}, rating ${selectedPreset.bulkRatingMin}-${selectedPreset.bulkRatingMax})`
                  : `Fine-tuned slots (${selectedPreset.problemSlots?.map((slot) => slot.rating).join(", ")})`}
              </strong>
            </>
          )}
        </div>

        <div
          className={`${styles.previewSection} ${styles.previewSectionLast}`}
        >
          <span className={styles.previewLabel}>Bronze Playoff:</span>
          <strong className={styles.previewValue}>
            {formData.thirdPlacePlayoff ? "Enabled" : "Disabled"}
          </strong>

          <span className={styles.previewLabel}>Seeding:</span>
          <strong
            className={`${styles.previewValue} ${styles.previewValueCap}`}
          >
            {formData.seedingMethod === "cf_rating"
              ? "Auto Codeforces Rating"
              : "Manual"}
          </strong>
        </div>
      </div>
    </div>
  );
}
