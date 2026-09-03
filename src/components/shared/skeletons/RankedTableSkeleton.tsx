import Skeleton from "./Skeleton";
import SkeletonPage from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

const WIDTHS = ["72%", "58%", "81%", "49%", "66%", "74%", "55%", "68%"];

export default function RankedTableSkeleton({
  title,
  lead,
  kicker,
  rows = 8,
}: {
  title: string;
  lead?: string;
  kicker?: string;
  rows?: number;
}) {
  return (
    <SkeletonPage title={title} lead={lead} kicker={kicker}>
      <div className={styles.frame}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={styles.rankRow}>
            <Skeleton width="36px" height={16} />
            <Skeleton width={WIDTHS[i % WIDTHS.length]} />
            <Skeleton width="100%" height={11} />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
