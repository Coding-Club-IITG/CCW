import Skeleton from "./Skeleton";
import SkeletonPage from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

export default function CardGridSkeleton({
  title,
  lead,
  kicker,
  cards = 6,
}: {
  title: string;
  lead?: string;
  kicker?: string;
  cards?: number;
}) {
  return (
    <SkeletonPage title={title} lead={lead} kicker={kicker}>
      <div className={styles.cardGrid}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className={styles.cardCell}>
            <Skeleton width="64%" height={10} />
            <div style={{ height: 11 }} />
            <Skeleton width="100%" height={10} />
            <div style={{ height: 6 }} />
            <Skeleton width="70%" height={10} />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
