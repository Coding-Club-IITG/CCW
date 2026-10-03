import BackLink from "@/components/shared/BackLink";
import Skeleton from "@/components/shared/skeletons/Skeleton";
import { SkeletonBody } from "@/components/shared/skeletons/SkeletonPage";

import styles from "@/components/contests/MatchHistoryClient.module.scss";

export default function Loading() {
  return (
    <div className={styles.page}>
      <div className={styles.bgPattern} aria-hidden="true" />

      <div className={styles.main}>
        <BackLink href="/internal/contests" label="Back to Contests" />

        <header className={styles.header}>
          <h1>Match History</h1>
          <p>Review your recent algorithmic battles and performance metrics.</p>
        </header>

        <SkeletonBody label="match history">
          <div className={styles.controlBar} aria-hidden="true">
            <div className={styles.filters}>
              <Skeleton width="148px" height={36} />
              <Skeleton width="164px" height={36} />
              <div className={styles.dateGroup}>
                <Skeleton width="136px" height={36} />
                <span className={styles.dateSep}>-</span>
                <Skeleton width="136px" height={36} />
              </div>
            </div>
          </div>

          <div className={styles.list}>
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={styles.matchCard}>
                <div className={styles.info}>
                  <Skeleton width="60%" height={18} />
                  <div className={styles.badgeRow}>
                    <Skeleton width="72px" height={22} />
                    <Skeleton width="54px" height={22} />
                  </div>
                  <Skeleton width="45%" height={14} />
                </div>
                <div className={styles.score}>
                  <Skeleton width="100px" height={32} />
                </div>
                <div className={styles.cta}>
                  <Skeleton width="104px" height={36} />
                </div>
              </div>
            ))}
          </div>
        </SkeletonBody>
      </div>
    </div>
  );
}
