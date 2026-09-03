import Skeleton from "./Skeleton";
import SkeletonPage, {
  SkeletonBody,
  type SkeletonContentProps,
  type SkeletonPageProps,
} from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

type CardGridShape = { cards?: number };

export function CardGridSkeletonContent({
  cards = 6,
  label,
}: SkeletonContentProps & CardGridShape) {
  return (
    <SkeletonBody label={label} className={styles.cardGrid}>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className={styles.cardCell}>
          <Skeleton width="64%" height={10} />
          <Skeleton width="100%" height={10} />
          <Skeleton width="70%" height={10} />
        </div>
      ))}
    </SkeletonBody>
  );
}

export default function CardGridSkeleton({
  title,
  lead,
  label,
  ...shape
}: SkeletonPageProps & CardGridShape) {
  return (
    <SkeletonPage title={title} lead={lead}>
      <CardGridSkeletonContent {...shape} label={label ?? title} />
    </SkeletonPage>
  );
}
