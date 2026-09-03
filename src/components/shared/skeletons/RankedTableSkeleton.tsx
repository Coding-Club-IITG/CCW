import Skeleton from "./Skeleton";
import SkeletonPage, {
  SkeletonBody,
  type SkeletonContentProps,
  type SkeletonPageProps,
} from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

const WIDTHS = ["72%", "58%", "81%", "49%", "66%", "74%", "55%", "68%"];

type RankedShape = { rows?: number };

export function RankedTableSkeletonContent({
  rows = 8,
  label,
}: SkeletonContentProps & RankedShape) {
  return (
    <SkeletonBody label={label} className={styles.frame}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.rankRow}>
          <Skeleton width="36px" height={16} />
          <Skeleton width={WIDTHS[index % WIDTHS.length]} />
          <Skeleton width="100%" height={11} />
        </div>
      ))}
    </SkeletonBody>
  );
}

export default function RankedTableSkeleton({
  title,
  lead,
  label,
  ...shape
}: SkeletonPageProps & RankedShape) {
  return (
    <SkeletonPage title={title} lead={lead}>
      <RankedTableSkeletonContent {...shape} label={label ?? title} />
    </SkeletonPage>
  );
}
