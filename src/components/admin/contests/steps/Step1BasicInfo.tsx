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
      <h2 style={{ marginBottom: "1.5rem", fontSize: "1.25rem", color: "var(--foreground-strong)" }}>
        Step 1: Tournament Basic Info
      </h2>

      <div className={styles.field} style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "1.25rem" }}>
        <label style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--foreground)" }}>Tournament Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => updateFields({ name: e.target.value })}
          placeholder="e.g. CCW Monsoon Bracket Clash"
          style={{
            padding: "0.5rem 0.75rem",
            border: errors.name ? "1px solid var(--danger)" : "1px solid var(--border-input)",
            borderRadius: "6px",
            fontSize: "0.875rem",
            background: "var(--surface)",
            color: "var(--foreground)",
          }}
          required
        />
        {errors.name && <span style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{errors.name}</span>}
      </div>

      <div className={styles.field} style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "1.25rem" }}>
        <label style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--foreground)" }}>Description</label>
        <textarea
          value={description}
          onChange={(e) => updateFields({ description: e.target.value })}
          placeholder="Detailed rules, rules of bracket, prizes, etc. (max 500 characters)"
          maxLength={500}
          style={{
            padding: "0.5rem 0.75rem",
            border: errors.description ? "1px solid var(--danger)" : "1px solid var(--border-input)",
            borderRadius: "6px",
            fontSize: "0.875rem",
            background: "var(--surface)",
            color: "var(--foreground)",
            minHeight: "80px",
            resize: "vertical",
          }}
        />
        {errors.description && <span style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{errors.description}</span>}
      </div>

      <div style={{ display: "flex", gap: "2rem", marginBottom: "1.25rem" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--foreground)", display: "block", marginBottom: "0.5rem" }}>
            Format (Fixed)
          </label>
          <input
            type="text"
            value="Bracket (Knockout)"
            disabled
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              border: "1px solid var(--border-input)",
              borderRadius: "6px",
              fontSize: "0.875rem",
              background: "var(--surface-hover)",
              color: "var(--muted)",
              cursor: "not-allowed",
            }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--foreground)", display: "block", marginBottom: "0.5rem" }}>
            Match Mode
          </label>
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", cursor: "pointer" }}>
              <input
                type="radio"
                name="mode"
                checked={mode === "blitz"}
                onChange={() => updateFields({ mode: "blitz" })}
              />
              Blitz
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", cursor: "pointer" }}>
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

      <div className={styles.field} style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        <label style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--foreground)", marginBottom: "0.5rem" }}>
          Team Size
        </label>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", cursor: "pointer" }}>
            <input
              type="radio"
              name="teamSize"
              checked={teamSize === 1}
              onChange={() => updateFields({ teamSize: 1 })}
            />
            Solo (1v1 matches)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", cursor: "pointer" }}>
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
