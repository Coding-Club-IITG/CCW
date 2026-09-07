"use client";

import { useState } from "react";
import { Code2, FileText } from "lucide-react";

import type { ContestRoomProblemDto } from "@/lib/contests/dtos";
import ContestProblemContent from "@/components/contests/ContestProblemContent";
import ContestCodeRunner from "@/components/contests/ContestCodeRunner";

import styles from "./ContestProblemWorkspace.module.scss";

export interface ContestProblemWorkspaceProps {
  problem?: ContestRoomProblemDto;
  isSpectator?: boolean;
}

export type WorkspaceViewMode = "statement" | "runner";

export default function ContestProblemWorkspace({
  problem,
  isSpectator = false,
}: ContestProblemWorkspaceProps) {
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>("statement");

  if (!problem) return null;

  const effectiveMode =
    isSpectator && viewMode === "runner" ? "statement" : viewMode;

  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceHeader}>
        <div className={styles.viewTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={effectiveMode === "statement"}
            className={`${styles.viewTab} ${
              effectiveMode === "statement" ? styles.activeTab : ""
            }`}
            onClick={() => setViewMode("statement")}
            title="Problem statement"
          >
            <FileText size={14} />
            <span>Statement</span>
          </button>
          {!isSpectator && (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveMode === "runner"}
              className={`${styles.viewTab} ${
                effectiveMode === "runner" ? styles.activeTab : ""
              }`}
              onClick={() => setViewMode("runner")}
              title="Code editor and test runner"
            >
              <Code2 size={14} />
              <span>Code Runner</span>
            </button>
          )}
        </div>
      </div>

      <div className={styles.workspaceBody}>
        {effectiveMode === "statement" && (
          <div className={styles.statementPane}>
            <ContestProblemContent problem={problem} plain />
          </div>
        )}

        {!isSpectator && effectiveMode === "runner" && (
          <div className={styles.runnerPane}>
            <ContestCodeRunner
              problemId={problem.problemId}
              samples={problem.samples}
              plain
            />
          </div>
        )}
      </div>
    </div>
  );
}
