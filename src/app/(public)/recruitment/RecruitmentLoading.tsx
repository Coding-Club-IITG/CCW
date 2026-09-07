import RecruitmentHeader from "@/components/public/recruitment/RecruitmentHeader";
import Skeleton from "@/components/shared/skeletons/Skeleton";
import styles from "@/components/public/recruitment/Recruitment.module.scss";

export default function RecruitmentLoading() {
  return (
    <>
      <RecruitmentHeader />
      <div className={styles.content}>
        <div
          className={styles.skeleton}
          role="status"
          aria-label="Loading recruitment editions"
        >
          <Skeleton width="280px" height={44} />
          <Skeleton height={24} />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} height={110} />
          ))}
        </div>
      </div>
    </>
  );
}
