import styles from "./SetProblem.module.scss";
import { DifficultyBadge } from "@/components/shared/DifficultyBadge";
import { IconTrash } from "@/components/shared/Icons";
import { PLATFORM_DISPLAY_NAMES, PLATFORM_PROBLEM_URLS } from "@/lib/constants";
import { formatDate } from "@/lib/potd/utils";
import type { ScheduledChallenge } from "@/lib/actions/admin/potd";

interface ScheduledProblemCardProps {
  prob: ScheduledChallenge;
  isToday: boolean;
  onDelete: (id: string, isToday: boolean) => void;
  disabled: boolean;
}

export function ScheduledProblemCard({
  prob,
  isToday,
  onDelete,
  disabled,
}: ScheduledProblemCardProps) {
  return (
    <div
      className={styles.problemCard}
      style={
        isToday ? { borderLeft: "3px solid var(--accent-light)" } : undefined
      }
    >
      <div className={styles.cardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className={styles.dateLabel}>
            {isToday ? "Today" : formatDate(prob.dateStr, "long")}
          </span>
          {isToday && (
            <span
              style={{
                fontSize: "0.7rem",
                background: "var(--accent-light)",
                color: "white",
                padding: "1px 6px",
                borderRadius: "999px",
              }}
            >
              LIVE
            </span>
          )}
          <DifficultyBadge difficulty={prob.difficulty} />
        </div>
        <div className={styles.cardActions}>
          <button
            title={isToday ? "Remove today's problem" : "Delete Problem"}
            className={styles.iconBtnDestructive}
            onClick={() => onDelete(prob.id, isToday)}
            disabled={disabled}
          >
            <IconTrash width="16" height="16" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={styles.cardBody}>
        <h4>{prob.problem.name}</h4>
        <div className={styles.meta}>
          <span className={styles.difficulty}>
            Rating: {prob.problem.rating || "Unrated"}
          </span>
          <a
            href={PLATFORM_PROBLEM_URLS[prob.platform](
              prob.problem.contestId,
              prob.problem.problemIndex,
            )}
            target="_blank"
            rel="noreferrer"
            className={styles.urlLink}
          >
            View on {PLATFORM_DISPLAY_NAMES[prob.platform]} ↗
          </a>
        </div>
      </div>
    </div>
  );
}
