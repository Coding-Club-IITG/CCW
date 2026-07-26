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
      <h2 className={styles.stepTitle}>Step 3: Select Match Preset</h2>

      {errors.presetId && (
        <div className={`${styles.error} ${styles.errorBlock}`}>
          {errors.presetId}
        </div>
      )}

      <div className={styles.presetList}>
        {presets.map((preset) => (
          <label
            key={preset._id}
            className={`${styles.presetCard} ${
              selectedPresetId === preset._id ? styles.presetCardActive : ""
            }`}
          >
            <input
              type="radio"
              name="presetId"
              checked={selectedPresetId === preset._id}
              onChange={() => updateFields({ presetId: preset._id })}
            />
            <div className={styles.presetInfo}>
              <span className={styles.presetName}>{preset.name}</span>
              {preset.description && (
                <span className={styles.presetDesc}>{preset.description}</span>
              )}
            </div>
          </label>
        ))}
      </div>

      {selectedPreset && (
        <div className={styles.presetDetails}>
          <h3 className={styles.presetDetailsTitle}>
            Preset Details: {selectedPreset.name}
          </h3>
          <div className={styles.detailsGrid}>
            <div>
              <span className={styles.detailLabel}>Format:</span>{" "}
              <strong className={styles.detailValue}>
                {selectedPreset.format}
              </strong>
            </div>
            <div>
              <span className={styles.detailLabel}>Mode:</span>{" "}
              <strong className={styles.detailValue}>
                {selectedPreset.mode}
              </strong>
            </div>
            <div>
              <span className={styles.detailLabel}>Duration:</span>{" "}
              <strong className={styles.detailValue}>
                {Math.round((selectedPreset.durationSeconds || 0) / 60)} minutes
              </strong>
            </div>
            <div>
              <span className={styles.detailLabel}>Selection:</span>{" "}
              <strong className={styles.detailValue}>
                {selectedPreset.problemSelectionMode}
              </strong>
            </div>
            {selectedPreset.problemSelectionMode === "bulk" ? (
              <>
                <div>
                  <span className={styles.detailLabel}>Platform:</span>{" "}
                  <strong className={styles.detailValue}>
                    {selectedPreset.bulkPlatform}
                  </strong>
                </div>
                <div>
                  <span className={styles.detailLabel}>Rating Range:</span>{" "}
                  <strong className={styles.detailValue}>
                    {selectedPreset.bulkRatingMin} -{" "}
                    {selectedPreset.bulkRatingMax}
                  </strong>
                </div>
                <div>
                  <span className={styles.detailLabel}>Count:</span>{" "}
                  <strong className={styles.detailValue}>
                    {selectedPreset.bulkProblemCount}
                  </strong>
                </div>
                {selectedPreset.bulkMinContestId ? (
                  <div>
                    <span className={styles.detailLabel}>Min Contest ID:</span>{" "}
                    <strong className={styles.detailValue}>
                      ≥ {selectedPreset.bulkMinContestId}
                    </strong>
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.detailSpan2}>
                <span className={styles.detailLabel}>Problem Ratings:</span>{" "}
                <strong className={styles.detailValue}>
                  {selectedPreset.problemSlots
                    ?.map((s: any) => s.rating)
                    .join(", ")}
                </strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
