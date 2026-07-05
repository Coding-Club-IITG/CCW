import styles from "../ContestWizard.module.scss";

interface Step2Props {
  registrationType: string;
  maxParticipants: number;
  updateFields: (fields: any) => void;
  errors: Record<string, string>;
}

export default function Step2Registration({
  registrationType,
  maxParticipants,
  updateFields,
  errors,
}: Step2Props) {
  return (
    <div>
      <h2 style={{ marginBottom: "1.5rem", fontSize: "1.25rem", color: "var(--foreground-strong)" }}>
        Step 2: Registration settings
      </h2>

      <div className={styles.field} style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "1.25rem" }}>
        <label style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--foreground)", marginBottom: "0.5rem" }}>
          Registration Type
        </label>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", cursor: "pointer" }}>
            <input
              type="radio"
              name="registrationType"
              checked={registrationType === "open"}
              onChange={() => updateFields({ registrationType: "open" })}
            />
            Open (Any verified user can join)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", cursor: "pointer" }}>
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

      <div className={styles.field} style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <label style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--foreground)" }}>
          Max Participants (Total brackets / teams size)
        </label>
        <input
          type="number"
          value={maxParticipants}
          onChange={(e) => updateFields({ maxParticipants: Number(e.target.value) })}
          min={2}
          style={{
            padding: "0.5rem 0.75rem",
            border: errors.maxParticipants ? "1px solid var(--danger)" : "1px solid var(--border-input)",
            borderRadius: "6px",
            fontSize: "0.875rem",
            background: "var(--surface)",
            color: "var(--foreground)",
          }}
          required
        />
        {errors.maxParticipants && <span style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{errors.maxParticipants}</span>}
      </div>
    </div>
  );
}
