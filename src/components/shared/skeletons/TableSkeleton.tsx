import Skeleton from "./Skeleton";
import SkeletonPage, {
  SkeletonBody,
  type SkeletonContentProps,
  type SkeletonPageProps,
} from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

const WIDTHS = ["58%", "72%", "46%", "64%", "80%", "52%"];

type TableShape = { columns?: number; rows?: number };

export function TableSkeletonContent({
  columns = 4,
  rows = 6,
  label,
}: SkeletonContentProps & TableShape) {
  const template = `2.2fr ${Array.from({ length: columns - 1 }, () => "1fr").join(" ")}`;
  return (
    <SkeletonBody label={label} className={styles.frame}>
      <div
        className={styles.tableHead}
        style={{ gridTemplateColumns: template }}
      >
        {Array.from({ length: columns }, (_, index) => (
          <span key={index}>
            <Skeleton width="62%" height={10} />
          </span>
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className={styles.row}
          style={{ gridTemplateColumns: template }}
        >
          {Array.from({ length: columns }, (_, column) => (
            <span key={column}>
              <Skeleton
                width={column === 0 ? WIDTHS[row % WIDTHS.length] : "48%"}
              />
            </span>
          ))}
        </div>
      ))}
    </SkeletonBody>
  );
}

export default function TableSkeleton({
  title,
  lead,
  label,
  ...shape
}: SkeletonPageProps & TableShape) {
  return (
    <SkeletonPage title={title} lead={lead}>
      <TableSkeletonContent {...shape} label={label ?? title} />
    </SkeletonPage>
  );
}
