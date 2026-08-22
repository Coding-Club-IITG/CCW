import styles from "../ContestWizard.module.scss";

interface Step4Props {
  thirdPlacePlayoff: boolean;
  seedingMethod: "cf_rating" | "manual";
  updateFields: (fields: {
    thirdPlacePlayoff?: boolean;
    seedingMethod?: "cf_rating" | "manual";
  }) => void;
  errors: Record<string, string>;
}

export default function Step4BracketSettings({
  thirdPlacePlayoff,
  seedingMethod,
  updateFields,
  errors,
}: Step4Props) {
  return (
    <div>
      <h2 className={styles.stepTitle}>Step 4: Bracket & Seeding Settings</h2>

      <div className={`${styles.field} ${styles.fieldWide}`}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={thirdPlacePlayoff}
            onChange={(e) =>
              updateFields({ thirdPlacePlayoff: e.target.checked })
            }
          />
          Third-Place Playoff Match
        </label>
        <span className={styles.checkboxHint}>
          If checked, a bronze-medal match will be created for semifinal losers.
        </span>
      </div>

      <div className={`${styles.field} ${styles.fieldFlush}`}>
        <label className={`${styles.label} ${styles.labelBlock}`}>
          Bracket Seeding Method
        </label>
        <div className={styles.radioColumn}>
          <label className={`${styles.radioLabel} ${styles.radioLabelTop}`}>
            <input
              type="radio"
              name="seedingMethod"
              checked={seedingMethod === "cf_rating"}
              onChange={() => updateFields({ seedingMethod: "cf_rating" })}
            />
            <div>
              <strong className={styles.radioTitle}>
                Auto Codeforces Rating
              </strong>
              <span className={styles.radioSubtext}>
                Automatically seeds brackets from top rating down to minimize
                early matches between top-seeded users/teams.
              </span>
            </div>
          </label>

          <label className={`${styles.radioLabel} ${styles.radioLabelTop}`}>
            <input
              type="radio"
              name="seedingMethod"
              checked={seedingMethod === "manual"}
              onChange={() => updateFields({ seedingMethod: "manual" })}
            />
            <div>
              <strong className={styles.radioTitle}>Manual Seeding</strong>
              <span className={styles.radioSubtext}>
                Brackets will be seeded manually by the administrator before
                starting the tournament.
              </span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
