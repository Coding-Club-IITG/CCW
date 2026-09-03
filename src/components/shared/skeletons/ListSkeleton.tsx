import Skeleton from "./Skeleton";
import SkeletonPage from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

const WIDTHS = ["62%", "76%", "54%", "69%", "58%", "72%"];

export function ListSkeletonContent({
  rows = 5,
  label = "items",
  announce = true,
}: {
  rows?: number;
  label?: string;
  announce?: boolean;
}) {
  return (
    <div className={styles.frame} aria-busy="true">
      {announce && (
        <span className={styles.status} role="status" aria-live="polite">
          Loading {label}…
        </span>
      )}
      {Array.from({ length: rows }, (_, index) => (
        <div className={styles.listRow} key={index}>
          <Skeleton width="32px" height={32} />
          <span className={styles.listCopy}>
            <Skeleton width={WIDTHS[index % WIDTHS.length]} height={12} />
            <Skeleton width="42%" height={10} />
          </span>
          <Skeleton width="68px" height={10} />
        </div>
      ))}
    </div>
  );
}

export default function ListSkeleton({
  title,
  lead,
  kicker,
  rows = 5,
}: {
  title: string;
  lead?: string;
  kicker?: string;
  rows?: number;
}) {
  return (
    <SkeletonPage title={title} lead={lead} kicker={kicker}>
      <ListSkeletonContent rows={rows} label={title} announce={false} />
    </SkeletonPage>
  );
}
