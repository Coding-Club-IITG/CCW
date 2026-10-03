import type { ContestWizardForm } from "@/components/contests/contestCreationForm";

import styles from "../ContestWizard.module.scss";

interface Step2Props {
  registrationType: string;
  spectatorRestriction?: ContestWizardForm["spectatorRestriction"];
  entrantCapacity: number;
  startTime: string;
  updateFields: (fields: {
    registrationType?: "open" | "closed";
    spectatorRestriction?: ContestWizardForm["spectatorRestriction"];
    entrantCapacity?: number;
    startTime?: string;
  }) => void;
  errors: Record<string, string>;
}

export default function Step2Registration({
  registrationType,
  spectatorRestriction,
  entrantCapacity,
  startTime,
  updateFields,
  errors,
}: Step2Props) {
  return (
    <div>
      <h2 className={styles.stepTitle}>Registration settings</h2>

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

      <div className={styles.field}>
        <label
          htmlFor="wizard-spectatorRestriction"
          className={`${styles.label} ${styles.labelBlock}`}
        >
          Spectator Access
        </label>
        <select
          id="wizard-spectatorRestriction"
          className={styles.input}
          value={spectatorRestriction}
          onChange={(e) =>
            updateFields({
              spectatorRestriction: e.target
                .value as ContestWizardForm["spectatorRestriction"],
            })
          }
        >
          <option value="none">No Spectators</option>
          <option value="all">Any Authenticated User</option>
          <option value="club_members">Club / Module Members</option>
          <option value="admin_creator">Admins & Creator Only</option>
        </select>
      </div>

      <div className={`${styles.field} ${styles.fieldFlush}`}>
        <label htmlFor="wizard-startTime" className={styles.label}>
          Tournament Start (IST)
        </label>
        <input
          id="wizard-startTime"
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
        <label htmlFor="wizard-entrantCapacity" className={styles.label}>
          Max Entrants (players or teams)
        </label>
        <input
          id="wizard-entrantCapacity"
          type="number"
          value={entrantCapacity}
          onChange={(e) =>
            updateFields({ entrantCapacity: Number(e.target.value) })
          }
          min={2}
          className={`${styles.input} ${errors.entrantCapacity ? styles.inputError : ""}`}
          required
        />
        {errors.entrantCapacity && (
          <span className={styles.error}>{errors.entrantCapacity}</span>
        )}
      </div>
    </div>
  );
}
