import Skeleton from "./Skeleton";
import SkeletonPage, {
  SkeletonBody,
  type SkeletonContentProps,
  type SkeletonPageProps,
} from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

const WIDTHS = ["62%", "76%", "54%", "69%", "58%", "72%"];

type ListShape = { rows?: number };

export function ListSkeletonContent({
  rows = 5,
  label,
}: SkeletonContentProps & ListShape) {
  return (
    <SkeletonBody label={label} className={styles.frame}>
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
    </SkeletonBody>
  );
}

export default function ListSkeleton({
  title,
  lead,
  label,
  ...shape
}: SkeletonPageProps & ListShape) {
  return (
    <SkeletonPage title={title} lead={lead}>
      <ListSkeletonContent {...shape} label={label ?? title} />
    </SkeletonPage>
  );
}
