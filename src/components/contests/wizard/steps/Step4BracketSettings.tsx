import styles from "../ContestWizard.module.scss";

interface Step4Props {
  bracketType?: "single_elimination" | "double_elimination";
  updateFields: (fields: {
    bracketType?: "single_elimination" | "double_elimination";
  }) => void;
}

export default function Step4BracketSettings({
  bracketType,
  updateFields,
}: Step4Props) {
  return (
    <div>
      <h2 className={styles.stepTitle}>Bracket & Seeding Settings</h2>

      <div className={`${styles.field} ${styles.fieldFlush}`}>
        <label
          htmlFor="wizard-bracketType-single-elimination-"
          className={`${styles.label} ${styles.labelBlock}`}
        >
          Elimination Type
        </label>
        <select
          id="wizard-bracketType-single-elimination-"
          value={bracketType || "single_elimination"}
          onChange={(e) =>
            updateFields({
              bracketType: e.target.value as
                "single_elimination" | "double_elimination",
            })
          }
          className={styles.input}
        >
          <option value="single_elimination">Single Elimination</option>
          <option value="double_elimination">Double Elimination</option>
        </select>
      </div>

      <p className={styles.stepDescription}>
        Seeds use Codeforces ratings, averaged for teams. Highest seeds receive
        byes.
      </p>
    </div>
  );
}
