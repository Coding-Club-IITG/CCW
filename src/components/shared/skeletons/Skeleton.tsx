import styles from "./Skeleton.module.scss";

/** A single sweeping placeholder bar */
export default function Skeleton({
  width = "100%",
  height = 11,
}: {
  width?: string;
  height?: number;
}) {
  return (
    <span className={styles.bar} style={{ width, height }} aria-hidden="true" />
  );
}
