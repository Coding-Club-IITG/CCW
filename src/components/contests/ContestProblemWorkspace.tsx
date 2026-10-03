"use client";

import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft, ExternalLink, RefreshCw, Timer } from "lucide-react";
import Link from "next/link";
import type {
  ContestRoomProblemDto,
  RoomActivityDto,
} from "@/lib/contests/dtos";
import { renderProblemMath } from "@/lib/math";
import CodeRunnerWorkspace, {
  type CodeRunnerWorkspaceHandle,
} from "@/components/shared/code-runner/CodeRunnerWorkspace";
import { contestDraftIdentity } from "@/components/shared/code-runner/drafts";
import { getCodeforcesProblemUrl } from "./roomPresentation";
import { useRoomCountdown } from "./useRoomCountdown";
import RoomActivityFeed from "./RoomActivityFeed";
import styles from "./ContestProblemWorkspace.module.scss";

export type ContestProblemWorkspaceProps = {
  mode: "arena" | "blitz";
  roomId: string;
  userId: string;
  problem: ContestRoomProblemDto;
  problems: ContestRoomProblemDto[];
  currentProblem?: ContestRoomProblemDto;
  claims?: Record<string, string>;
  readOnly: boolean;
  visible: boolean;
  storageFailed: boolean;
  matchState: "waiting" | "active" | "completed";
  timeLeft: string;
  judgingDeadline?: number;
  scores: Array<{ id: string; name: string; score: number }>;
  activity: RoomActivityDto[];
  unread: number;
  onTabChange: (tab: string) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onSync: (id: string) => void;
  syncing: boolean;
  syncCooldown: number;
  hasHandle: boolean;
  resultsPath: string;
};

export default function ContestProblemWorkspace(
  props: ContestProblemWorkspaceProps,
) {
  const { problem, mode, currentProblem, matchState, visible, readOnly } =
    props;
  const workspaceRef = useRef<CodeRunnerWorkspaceHandle>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (visible) backRef.current?.focus({ preventScroll: true });
  }, [visible]);

  const content = useMemo(
    () => ({
      statementHtml: renderProblemMath(problem.statementHtml ?? ""),
      inputSpecificationHtml: renderProblemMath(
        problem.inputSpecificationHtml ?? "",
      ),
      outputSpecificationHtml: renderProblemMath(
        problem.outputSpecificationHtml ?? "",
      ),
      constraintsHtml: renderProblemMath(problem.constraintsHtml ?? ""),
      notesHtml: renderProblemMath(problem.notesHtml ?? ""),
      samples: problem.samples ?? [],
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
    }),
    [problem],
  );
  const problemTime = useRoomCountdown(
    matchState,
    currentProblem?.revealedAt ?? undefined,
    currentProblem?.deadlineAt && currentProblem.revealedAt
      ? (currentProblem.deadlineAt - currentProblem.revealedAt) / 1000
      : undefined,
  );
  const advanced =
    mode === "blitz" &&
    currentProblem &&
    currentProblem.problemId !== problem.problemId;
  const select = (id: string) => {
    workspaceRef.current?.flush();
    props.onSelect(id);
  };
  const claimed = props.claims?.[problem.problemId];
  const url = getCodeforcesProblemUrl(problem.problemId);

  return (
    <section
      className={styles.workspace}
      hidden={!visible}
      aria-label="Contest code runner"
    >
      <div className={styles.matchBar}>
        <button
          ref={backRef}
          type="button"
          className={styles.secondary}
          onClick={() => {
            workspaceRef.current?.flush();
            props.onBack();
          }}
        >
          <ArrowLeft size={14} />
          Back to Match
        </button>
        <div className={styles.scores}>
          {props.scores.map((team) => (
            <span key={team.id}>
              {team.name} <strong>{team.score} pts</strong>
            </span>
          ))}
        </div>
        <span className={styles.timing}>
          <Timer size={14} />
          {matchState === "completed"
            ? "Match over"
            : props.judgingDeadline
              ? "Play ended · Judging"
              : `${props.timeLeft} remaining`}
        </span>
        {mode === "blitz" && currentProblem && (
          <span className={styles.timing}>
            Current: {currentProblem.problemId} ·{" "}
            {currentProblem.closedAt
              ? "Closed"
              : currentProblem.deadlineAt
                ? problemTime
                : "Untimed"}
          </span>
        )}
        {!readOnly && (
          <button
            type="button"
            className={styles.primary}
            onClick={() => props.onSync(problem.problemId)}
            disabled={
              !props.hasHandle ||
              !!claimed ||
              props.syncing ||
              props.syncCooldown > 0 ||
              matchState !== "active"
            }
            title={
              !props.hasHandle
                ? "Please link your Codeforces account to sync"
                : `Sync ${problem.problemId}`
            }
          >
            <RefreshCw size={14} />
            {claimed
              ? "Claimed"
              : props.syncing
                ? "Syncing..."
                : props.syncCooldown > 0
                  ? `Wait ${props.syncCooldown}s`
                  : "Sync Submission"}
          </button>
        )}
      </div>
      <CodeRunnerWorkspace
        ref={workspaceRef}
        identity={contestDraftIdentity(
          props.userId,
          props.roomId,
          problem.problemId,
        )}
        content={content}
        readOnly={readOnly}
        visible={visible}
        header={
          <>
            {mode === "arena" ? (
              <select
                aria-label="Problem"
                className={styles.problemSelect}
                value={problem.problemId}
                onChange={(event) => select(event.target.value)}
              >
                {props.problems.map((item) => (
                  <option key={item.problemId} value={item.problemId}>
                    {item.problemId} · {item.name || "Problem"} -{" "}
                    {props.claims?.[item.problemId] || "Unclaimed"}
                  </option>
                ))}
              </select>
            ) : (
              <h1 className={styles.problemTitle}>
                {problem.problemId} · {problem.name || "Problem"}
              </h1>
            )}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className={styles.secondary}
              >
                Open on Codeforces
                <ExternalLink size={14} />
              </a>
            )}
          </>
        }
        notice={
          <>
            {!readOnly &&
              matchState === "active" &&
              !props.judgingDeadline &&
              !claimed &&
              !problem.closedAt && (
                <p className={styles.notice}>
                  Run locally for testing. Submit on Codeforces, then sync to
                  score.
                </p>
              )}
            {props.storageFailed && (
              <p className={styles.notice} role="status">
                Browser saving is unavailable. Your last viewed problem is
                remembered only while this page stays open.
              </p>
            )}
            {props.judgingDeadline && matchState === "active" && (
              <p className={styles.notice} role="status">
                Play has ended. On-time submissions can still be synced while
                judging finishes.
              </p>
            )}
            {problem.closedAt && matchState === "active" && (
              <p className={styles.notice}>
                This problem is closed. On-time submissions remain eligible
                during judging.
              </p>
            )}
            {advanced && (
              <div
                className={`${styles.notice} ${styles.noticeAction}`}
                role="status"
              >
                <span>
                  The match advanced to {currentProblem.problemId}. Your draft
                  is preserved.
                </span>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => select(currentProblem.problemId)}
                >
                  Open Current Problem
                </button>
              </div>
            )}
            {matchState === "completed" && (
              <div
                className={`${styles.notice} ${styles.noticeAction}`}
                role="status"
              >
                <span>Match complete. Scores are final.</span>
                <Link
                  className={styles.secondary}
                  href={props.resultsPath}
                  onClick={() => workspaceRef.current?.flush()}
                >
                  View Results
                </Link>
              </div>
            )}
          </>
        }
        extraTabs={[
          {
            id: "activity",
            label: `Activity${props.unread ? ` (${props.unread})` : ""}`,
            content: <RoomActivityFeed entries={props.activity} inline />,
          },
        ]}
        onTabChange={props.onTabChange}
      />
    </section>
  );
}
