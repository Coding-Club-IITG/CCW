import styles from "../ContestWizard.module.scss";

interface Step2Props {
  registrationType: string;
  maxParticipants: number;
  startTime: string;
  updateFields: (fields: {
    registrationType?: "open" | "closed";
    maxParticipants?: number;
    startTime?: string;
  }) => void;
  errors: Record<string, string>;
}

export default function Step2Registration({
  registrationType,
  maxParticipants,
  startTime,
  updateFields,
  errors,
}: Step2Props) {
  return (
    <div>
      <h2 className={styles.stepTitle}>Step 2: Registration settings</h2>

      <div className={styles.field}>
        <label className={`${styles.label} ${styles.labelBlock}`}>
          Registration Type
        </label>
        <div className={styles.radioRow}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="registrationType"
              checked={registrationType === "open"}
              onChange={() => updateFields({ registrationType: "open" })}
            />
            Open (Any verified user can join)
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="registrationType"
              checked={registrationType === "closed"}
              onChange={() => updateFields({ registrationType: "closed" })}
            />
            Closed (Invite-only / Manual registration)
          </label>
        </div>
      </div>

      <div className={`${styles.field} ${styles.fieldFlush}`}>
        <label className={styles.label}>Tournament Start</label>
        <input
          type="datetime-local"
          value={startTime}
          onChange={(event) => updateFields({ startTime: event.target.value })}
          className={`${styles.input} ${errors.startTime ? styles.inputError : ""}`}
          required
        />
        {errors.startTime && (
          <span className={styles.error}>{errors.startTime}</span>
        )}
      </div>

      <div className={`${styles.field} ${styles.fieldFlush}`}>
        <label className={styles.label}>
          Max Participants (Total brackets / teams size)
        </label>
        <input
          type="number"
          value={maxParticipants}
          onChange={(e) =>
            updateFields({ maxParticipants: Number(e.target.value) })
          }
          min={2}
          className={`${styles.input} ${errors.maxParticipants ? styles.inputError : ""}`}
          required
        />
        {errors.maxParticipants && (
          <span className={styles.error}>{errors.maxParticipants}</span>
        )}
      </div>
    </div>
  );
}
