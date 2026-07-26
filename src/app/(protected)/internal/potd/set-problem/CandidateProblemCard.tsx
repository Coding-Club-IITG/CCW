import styles from "./AutoProblemModal.module.scss";
import { DifficultyBadge } from "@/components/shared/DifficultyBadge";
import { RefreshCw, ExternalLink } from "lucide-react";
import { PLATFORM_PROBLEM_URLS } from "@/lib/constants";
import { formatDate } from "@/lib/potd/utils";
import type { POTDCandidateResult } from "@/lib/actions/admin/potd";

interface CandidateProblemCardProps {
  item: POTDCandidateResult;
  isToday: boolean;
  isRerolling: boolean;
  saving: boolean;
  onReroll: (id: string) => void;
}

export function CandidateProblemCard({
  item,
  isToday,
  isRerolling,
  saving,
  onReroll,
}: CandidateProblemCardProps) {
  const prob = item.problem;

  return (
    <div className={styles.candidateCard}>
      <div className={styles.candidateHeader}>
        <div className={styles.candidateMeta}>
          <span className={styles.dateText}>
            {isToday ? "Today" : formatDate(item.dateStr, "short")}
          </span>
          <DifficultyBadge difficulty={item.difficulty} />
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            (Rating target: {item.ratingMin}-{item.ratingMax})
          </span>
        </div>

        <button
          className={styles.rerollBtn}
          disabled={isRerolling || saving}
          onClick={() => onReroll(item.id)}
          title="Reroll another random problem for this slot"
        >
          <RefreshCw
            size={14}
            className={isRerolling ? styles.spinner : undefined}
          />
          {isRerolling ? "Rerolling..." : "Reroll"}
        </button>
      </div>

      <div className={styles.candidateBody}>
        {prob ? (
          <div className={styles.probDetails}>
            <div className={styles.probTitle}>
              <span>{prob.name}</span>
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--primary)",
                }}
              >
                #{prob.problemId}
              </span>
            </div>
            <div className={styles.probSubText}>
              <span>Rating: {prob.rating || "Unrated"}</span>
              {prob.tags.length > 0 && (
                <span>
                  Tags:{" "}
                  {prob.tags.slice(0, 3).map((t) => (
                    <span key={t} className={styles.tag}>
                      {t}
                    </span>
                  ))}
                </span>
              )}
              <a
                href={PLATFORM_PROBLEM_URLS.codeforces(
                  prob.contestId,
                  prob.problemIndex,
                )}
                target="_blank"
                rel="noreferrer"
                className={styles.probSubText}
                style={{ color: "var(--link)", textDecoration: "none" }}
              >
                View on Codeforces <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--danger)", fontSize: "0.875rem" }}>
            {item.error || "No problem found"}
          </div>
        )}
      </div>
    </div>
  );
}
