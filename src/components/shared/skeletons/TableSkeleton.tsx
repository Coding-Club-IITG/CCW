import Skeleton from "./Skeleton";
import SkeletonPage from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

const WIDTHS = ["58%", "72%", "46%", "64%", "80%", "52%"];

export default function TableSkeleton({
  title,
  lead,
  kicker,
  columns = 4,
  rows = 6,
}: {
  title: string;
  lead?: string;
  kicker?: string;
  columns?: number;
  rows?: number;
}) {
  const template = `2.2fr ${Array.from({ length: columns - 1 }, () => "1fr").join(" ")}`;
  return (
    <SkeletonPage title={title} lead={lead} kicker={kicker}>
      <div className={styles.frame}>
        <div
          className={styles.tableHead}
          style={{ gridTemplateColumns: template }}
        >
          {Array.from({ length: columns }, (_, i) => (
            <span key={i}>
              <Skeleton width="62%" height={10} />
            </span>
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            className={styles.row}
            style={{ gridTemplateColumns: template }}
          >
            {Array.from({ length: columns }, (_, c) => (
              <span key={c}>
                <Skeleton width={c === 0 ? WIDTHS[r % WIDTHS.length] : "48%"} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
