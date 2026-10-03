"use client";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Platform } from "@/lib/constants";
import { PLATFORM_DISPLAY_NAMES, PLATFORM_PROBLEM_URLS } from "@/lib/constants";
import { syncMySubmission } from "@/lib/actions/potd";
import BackLink from "@/components/shared/BackLink";
import CodeRunnerWorkspace from "@/components/shared/code-runner/CodeRunnerWorkspace";
import { solveDraftIdentity } from "@/components/shared/code-runner/drafts";
import type { ProblemContent } from "@/components/shared/code-runner/ProblemStatement";
import styles from "@/components/shared/code-runner/Workspace.module.scss";

type Props = {
  platform?: string;
  contestId?: string;
  problemIndex?: string;
  title?: string;
  challengeId?: string;
  content?: ProblemContent | null;
};
export default function SolveClient({
  platform,
  contestId,
  problemIndex,
  title,
  challengeId,
  content,
}: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const problem =
    platform && contestId && problemIndex
      ? { platform, contestId, problemIndex }
      : undefined;
  const problemUrl = problem
    ? PLATFORM_PROBLEM_URLS[problem.platform as Platform]?.(
        problem.contestId,
        problem.problemIndex,
      )
    : undefined;
  const platformLabel = platform
    ? PLATFORM_DISPLAY_NAMES[platform as Platform] || platform
    : undefined;
  const handleSync = async () => {
    if (!challengeId) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncMySubmission(challengeId);
      if (result.ok) {
        if (result.data.status === "Accepted") {
          setSyncResult(`Solved! You earned ${result.data.pointsAwarded} pts.`);
        } else if (result.data.status === "Late") {
          setSyncResult(
            `Grace solve - ${result.data.pointsAwarded} pts (50% penalty).`,
          );
        } else if (result.data.status === "Pending") {
          setSyncResult("No accepted submission found yet. Try again later.");
        } else {
          setSyncResult(`Status: ${result.data.status}`);
        }
      } else {
        setSyncResult(result.error.message);
      }
    } catch {
      setSyncResult("An unexpected error occurred");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={styles.solvePage}>
      <CodeRunnerWorkspace
        identity={solveDraftIdentity(problem)}
        content={content}
        header={
          <>
            <BackLink back label="Go Back" />
            <div className={styles.headerInfo}>
              <h1 className={styles.problemTitle}>
                {problem
                  ? title || contestId + "/" + problemIndex
                  : "Code Runner"}
              </h1>
              {problemUrl && (
                <a
                  href={problemUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.platformBtn}
                >
                  Open on {platformLabel}
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </>
        }
        actions={
          challengeId && (
            <button
              className={styles.syncBtn}
              onClick={handleSync}
              disabled={syncing}
              type="button"
            >
              {syncing ? "Syncing..." : "Sync My Answer"}
            </button>
          )
        }
        notice={
          syncResult && (
            <div role="status" className={styles.notice}>
              {syncResult}
            </div>
          )
        }
      />
    </div>
  );
}
