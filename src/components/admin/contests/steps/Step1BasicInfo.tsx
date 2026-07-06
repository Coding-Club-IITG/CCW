import styles from "../ContestWizard.module.scss";

interface Step1Props {
  name: string;
  description: string;
  mode: string;
  teamSize: number;
  updateFields: (fields: any) => void;
  errors: Record<string, string>;
}

export default function Step1BasicInfo({
  name,
  description,
  mode,
  teamSize,
  updateFields,
  errors,
}: Step1Props) {
  return (
    <div>
      <h2 className={styles.stepTitle}>Step 1: Tournament Basic Info</h2>

      <div className={styles.field}>
        <label className={styles.label}>Tournament Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => updateFields({ name: e.target.value })}
          placeholder="e.g. CCW Monsoon Bracket Clash"
          className={`${styles.input} ${errors.name ? styles.inputError : ""}`}
          required
        />
        {errors.name && <span className={styles.error}>{errors.name}</span>}
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea
          value={description}
          onChange={(e) => updateFields({ description: e.target.value })}
          placeholder="Detailed rules, rules of bracket, prizes, etc. (max 500 characters)"
          maxLength={500}
          className={`${styles.textarea} ${errors.description ? styles.inputError : ""}`}
        />
        {errors.description && (
          <span className={styles.error}>{errors.description}</span>
        )}
      </div>

      <div className={styles.twoCol}>
        <div className={styles.col}>
          <label className={`${styles.label} ${styles.labelBlock}`}>
            Format (Fixed)
          </label>
          <input
            type="text"
            value="Bracket (Knockout)"
            disabled
            className={styles.input}
          />
        </div>

        <div className={styles.col}>
          <label className={`${styles.label} ${styles.labelBlock}`}>
            Match Mode
          </label>
          <div className={styles.radioRow}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="mode"
                checked={mode === "blitz"}
                onChange={() => updateFields({ mode: "blitz" })}
              />
              Blitz
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="mode"
                checked={mode === "arena"}
                onChange={() => updateFields({ mode: "arena" })}
              />
              Arena
            </label>
          </div>
        </div>
      </div>

      <div className={`${styles.field} ${styles.fieldFlush}`}>
        <label className={`${styles.label} ${styles.labelBlock}`}>
          Team Size
        </label>
        <div className={styles.radioRow}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="teamSize"
              checked={teamSize === 1}
              onChange={() => updateFields({ teamSize: 1 })}
            />
            Solo (1v1 matches)
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="teamSize"
              checked={teamSize === 3}
              onChange={() => updateFields({ teamSize: 3 })}
            />
            Trio Teams (3v3 matches)
          </label>
        </div>
      </div>
    </div>
  );
}
