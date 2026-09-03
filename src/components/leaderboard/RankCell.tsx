import styles from "./LeaderboardTable.module.scss";

const MEDALS = [styles.top1, styles.top2, styles.top3];

/** Zero-padded rank, medalled for the top three */
export default function RankCell({ rank }: { rank: number }) {
  const medal = MEDALS[rank - 1];

  return (
    <span
      className={`${styles.rank} ${medal ? styles.rankBadge : ""} ${medal ?? ""}`}
    >
      {String(rank).padStart(2, "0")}
    </span>
  );
}
