import styles from "./FilesClient.module.scss";

export default function DownloadPermissionField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.toggleLabel}>
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>Allow downloading</span>
        <span className={styles.toggleHint}>
          {value
            ? "Users can download this file"
            : "View-only - no download option"}
        </span>
      </label>
    </div>
  );
}
