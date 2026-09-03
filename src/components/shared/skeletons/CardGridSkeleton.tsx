import Skeleton from "./Skeleton";
import SkeletonPage from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

export function CardGridSkeletonContent({
  cards = 6,
  label = "cards",
  announce = true,
}: {
  cards?: number;
  label?: string;
  announce?: boolean;
}) {
  return (
    <div className={styles.cardGrid} aria-busy="true">
      {announce && (
        <span className={styles.status} role="status" aria-live="polite">
          Loading {label}…
        </span>
      )}
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className={styles.cardCell}>
          <Skeleton width="64%" height={10} />
          <div style={{ height: 11 }} />
          <Skeleton width="100%" height={10} />
          <div style={{ height: 6 }} />
          <Skeleton width="70%" height={10} />
        </div>
      ))}
    </div>
  );
}

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
      <CardGridSkeletonContent cards={cards} label={title} announce={false} />
    </SkeletonPage>
  );
}
