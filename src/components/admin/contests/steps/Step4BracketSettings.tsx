import styles from "../ContestWizard.module.scss";

interface Step4Props {
  thirdPlacePlayoff: boolean;
  seedingMethod: string;
  updateFields: (fields: any) => void;
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
      <h2 style={{ marginBottom: "1.5rem", fontSize: "1.25rem", color: "var(--foreground-strong)" }}>
        Step 4: Bracket & Seeding Settings
      </h2>

      <div className={styles.field} style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "1.5rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem" }}>
          <input
            type="checkbox"
            checked={thirdPlacePlayoff}
            onChange={(e) => updateFields({ thirdPlacePlayoff: e.target.checked })}
            style={{ width: "1rem", height: "1rem" }}
          />
          Third-Place Playoff Match
        </label>
        <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginLeft: "1.5rem" }}>
          If checked, a bronze-medal match will be created for semifinal losers.
        </span>
      </div>

      <div className={styles.field} style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <label style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--foreground)", marginBottom: "0.5rem" }}>
          Bracket Seeding Method
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
            <input
              type="radio"
              name="seedingMethod"
              checked={seedingMethod === "cf_rating"}
              onChange={() => updateFields({ seedingMethod: "cf_rating" })}
              style={{ marginTop: "0.2rem" }}
            />
            <div>
              <strong style={{ display: "block", color: "var(--foreground-strong)" }}>Auto Codeforces Rating</strong>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                Automatically seeds brackets from top rating down to minimize early matches between top-seeded users/teams.
              </span>
            </div>
          </label>

          <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
            <input
              type="radio"
              name="seedingMethod"
              checked={seedingMethod === "manual"}
              onChange={() => updateFields({ seedingMethod: "manual" })}
              style={{ marginTop: "0.2rem" }}
            />
            <div>
              <strong style={{ display: "block", color: "var(--foreground-strong)" }}>Manual Seeding</strong>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                Brackets will be seeded manually by the administrator before starting the tournament.
              </span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
