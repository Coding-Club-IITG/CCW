import Skeleton from "./Skeleton";
import SkeletonPage, {
  SkeletonBody,
  type SkeletonContentProps,
  type SkeletonPageProps,
} from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

type FormShape = { fields?: number };

export function FormSkeletonContent({
  fields = 4,
  label,
}: SkeletonContentProps & FormShape) {
  return (
    <SkeletonBody label={label} className={styles.form}>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className={styles.field}>
          <Skeleton width="96px" height={10} />
          <Skeleton width="100%" height={36} />
        </div>
      ))}
      <div className={styles.actions}>
        <Skeleton width="112px" height={36} />
        <Skeleton width="88px" height={36} />
      </div>
    </SkeletonBody>
  );
}

export default function FormSkeleton({
  title,
  lead,
  label,
  ...shape
}: SkeletonPageProps & FormShape) {
  return (
    <SkeletonPage title={title} lead={lead}>
      <FormSkeletonContent {...shape} label={label ?? title} />
    </SkeletonPage>
  );
}
