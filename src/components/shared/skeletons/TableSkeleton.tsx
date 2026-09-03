import Skeleton from "./Skeleton";
import SkeletonPage from "./SkeletonPage";
import styles from "./Skeleton.module.scss";

const WIDTHS = ["58%", "72%", "46%", "64%", "80%", "52%"];

export function TableSkeletonContent({
  columns = 4,
  rows = 6,
  label = "table",
  announce = true,
}: {
  columns?: number;
  rows?: number;
  label?: string;
  announce?: boolean;
}) {
  const template = `2.2fr ${Array.from({ length: columns - 1 }, () => "1fr").join(" ")}`;
  return (
    <div className={styles.frame} aria-busy="true">
      {announce && (
        <span className={styles.status} role="status" aria-live="polite">
          Loading {label}…
        </span>
      )}
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
    </div>
  );
}

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
  return (
    <SkeletonPage title={title} lead={lead} kicker={kicker}>
      <TableSkeletonContent
        columns={columns}
        rows={rows}
        label={title}
        announce={false}
      />
    </SkeletonPage>
  );
}
