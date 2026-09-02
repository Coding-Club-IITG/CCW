import EmptyState from "@/components/public/EmptyState";
import styles from "./LeaderboardTable.module.scss";

export type Column<T> = {
  key: string;
  header: string;
  render: (item: T, index: number) => React.ReactNode;
};

type Props<T> = {
  title: string;
  description: string;
  columns: Column<T>[];
  data: T[];
  getKey: (item: T, index: number) => string;
  emptyMessage?: string;
  toolbar?: React.ReactNode;
};

export default function LeaderboardTable<T>({
  title,
  description,
  columns,
  data,
  getKey,
  emptyMessage = "No data available.",
  toolbar,
}: Props<T>) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}

      <div className={styles.tableContainer}>
        {data.length === 0 ? (
          <EmptyState title={emptyMessage} />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr key={getKey(item, index)}>
                  {columns.map((col) => (
                    <td key={col.key}>{col.render(item, index)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export { styles as leaderboardStyles };
