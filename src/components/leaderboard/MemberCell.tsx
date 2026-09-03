import styles from "./LeaderboardTable.module.scss";

/** Member name over an optional platform handle */
export default function MemberCell({
  name,
  handle,
}: {
  name: string;
  handle?: string | null;
}) {
  return (
    <div className={styles.userInfo}>
      <span className={styles.userName}>{name}</span>
      {handle && <span className={styles.userHandle}>@{handle}</span>}
    </div>
  );
}
