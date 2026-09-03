import Skeleton from "./Skeleton";
import SkeletonPage from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

export default function FormSkeleton({
  title,
  lead,
  kicker,
  fields = 4,
}: {
  title: string;
  lead?: string;
  kicker?: string;
  fields?: number;
}) {
  return (
    <SkeletonPage title={title} lead={lead} kicker={kicker}>
      <div className={styles.form}>
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className={styles.field}>
            <Skeleton width="96px" height={10} />
            <Skeleton width="100%" height={36} />
          </div>
        ))}
        <div className={styles.actions}>
          <Skeleton width="112px" height={36} />
          <Skeleton width="88px" height={36} />
        </div>
      </div>
    </SkeletonPage>
  );
}
