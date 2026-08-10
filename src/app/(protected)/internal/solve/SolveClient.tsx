"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import "katex/dist/katex.min.css";

import type { CodeRunnerLanguage, TestCase, Platform } from "@/lib/constants";
import {
  CODE_RUNNER_DEFAULT_CODE,
  PLATFORM_DISPLAY_NAMES,
  PLATFORM_PROBLEM_URLS,
} from "@/lib/constants";
import { syncMySubmission } from "@/lib/actions/potd";

import {
  CodeEditor,
  LanguageSelector,
  TestCasePanel,
} from "@/components/shared/code-runner";
import {
  Copy as IconCopy,
  ExternalLink as IconExternalLink,
} from "lucide-react";
import BackLink from "@/components/shared/BackLink";

import styles from "./Solve.module.scss";

type Props = {
  platform?: string;
  contestId?: string;
  problemIndex?: string;
  title?: string;
  challengeId?: string;
  content?: {
    statementHtml: string;
    inputSpecificationHtml: string;
    outputSpecificationHtml: string;
    constraintsHtml?: string;
    notesHtml?: string;
    samples: Array<{ input: string; output: string }>;
    timeLimitMs?: number;
    memoryLimitMb?: number;
  } | null;
};

export default function SolveClient({
  platform,
  contestId,
  problemIndex,
  title,
  challengeId,
  content,
}: Props) {
  const [language, setLanguage] = useState<CodeRunnerLanguage>("cpp");
  const [code, setCode] = useState<string>("");
  const initialTestCases: TestCase[] = (content?.samples ?? []).map(
    (sample, index) => ({
      id: `sample-${index + 1}`,
      input: sample.input,
      expectedOutput: sample.output,
      isCustom: false,
    }),
  );
  const [testCases, setTestCases] = useState<TestCase[]>(initialTestCases);
  const [activeTestCaseId, setActiveTestCaseId] = useState<string | null>(
    initialTestCases[0]?.id ?? null,
  );
  const [rightPanelTab, setRightPanelTab] = useState<"problem" | "tests">(
    content ? "problem" : "tests",
  );
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(35);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);

  const hasProblem = !!(platform && contestId && problemIndex);
  const storageKey = hasProblem
    ? `solve-code-${platform}-${contestId}-${problemIndex}-${language}`
    : `solve-code-scratch-${language}`;
  const problemUrl = hasProblem
    ? PLATFORM_PROBLEM_URLS[platform as Platform]?.(contestId, problemIndex)
    : undefined;
  const platformLabel = hasProblem
    ? PLATFORM_DISPLAY_NAMES[platform as Platform] || platform
    : undefined;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setCode(saved);
    } else {
      setCode(CODE_RUNNER_DEFAULT_CODE[language]);
    }
  }, [storageKey, language]);

  // Resize handlers
  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const offsetFromRight = rect.right - e.clientX;
      const percent = (offsetFromRight / rect.width) * 100;
      setRightPanelWidth(Math.min(60, Math.max(20, percent)));
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleCodeChange = useCallback(
    (newCode: string) => {
      setCode(newCode);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        localStorage.setItem(storageKey, newCode);
      }, 500);
    },
    [storageKey],
  );

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSync = async () => {
    if (!challengeId) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncMySubmission(challengeId);
      if (result.ok) {
        if (result.status === "Accepted") {
          setSyncResult(`Solved! You earned ${result.pointsAwarded} pts.`);
        } else if (result.status === "Late") {
          setSyncResult(
            `Grace solve - ${result.pointsAwarded} pts (50% penalty).`,
          );
        } else if (result.status === "Pending") {
          setSyncResult("No accepted submission found yet. Try again later.");
        } else {
          setSyncResult(`Status: ${result.status}`);
        }
      } else {
        setSyncResult(result.error ?? "Sync failed");
      }
    } catch {
      setSyncResult("An unexpected error occurred");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={styles.solvePage}>
      {/* Header */}
      <div className={styles.header}>
        <BackLink back label="Go Back" />
        {hasProblem ? (
          <div className={styles.headerInfo}>
            <h1 className={styles.problemTitle}>
              {title || `${contestId}/${problemIndex}`}
            </h1>
            {problemUrl && (
              <a
                href={problemUrl}
                target="_blank"
                rel="noreferrer"
                className={styles.platformBtn}
              >
                Open on {platformLabel}
                <IconExternalLink width="14" height="14" />
              </a>
            )}
          </div>
        ) : (
          <h1 className={styles.problemTitle}>Code Runner</h1>
        )}
      </div>

      {/* Main split layout */}
      <div className={styles.solveContainer} ref={containerRef}>
        {/* Left panel: Code editor */}
        <div className={styles.leftPanel}>
          <div className={styles.toolbar}>
            <LanguageSelector language={language} onChange={setLanguage} />
            <div className={styles.toolbarActions}>
              <button
                className={styles.copyBtn}
                onClick={handleCopyToClipboard}
                type="button"
              >
                <IconCopy width="14" height="14" />
                {copied ? "Copied!" : "Copy Code"}
              </button>
              {challengeId && (
                <button
                  className={styles.syncBtn}
                  onClick={handleSync}
                  disabled={syncing}
                  type="button"
                >
                  {syncing ? "Syncing..." : "Sync My Answer"}
                </button>
              )}
            </div>
          </div>
          {syncResult && <div className={styles.syncMessage}>{syncResult}</div>}
          <div className={styles.editorArea}>
            <CodeEditor
              language={language}
              value={code}
              onChange={handleCodeChange}
            />
          </div>
        </div>

        {/* Divider (draggable) */}
        <div className={styles.divider} onMouseDown={handleMouseDown} />

        {/* Right panel: Test cases */}
        <div
          className={styles.rightPanel}
          style={{ flexBasis: `${rightPanelWidth}%` }}
        >
          {content && (
            <div className={styles.panelTabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={rightPanelTab === "problem"}
                className={
                  rightPanelTab === "problem"
                    ? styles.panelTabActive
                    : styles.panelTab
                }
                onClick={() => setRightPanelTab("problem")}
              >
                Problem
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightPanelTab === "tests"}
                className={
                  rightPanelTab === "tests"
                    ? styles.panelTabActive
                    : styles.panelTab
                }
                onClick={() => setRightPanelTab("tests")}
              >
                Sample tests ({testCases.length})
              </button>
            </div>
          )}
          {content && rightPanelTab === "problem" ? (
            <article className={styles.problemStatement}>
              {(content.timeLimitMs || content.memoryLimitMb) && (
                <div className={styles.problemLimits}>
                  {content.timeLimitMs && (
                    <span>Time: {content.timeLimitMs / 1000}s</span>
                  )}
                  {content.memoryLimitMb && (
                    <span>Memory: {content.memoryLimitMb} MB</span>
                  )}
                </div>
              )}
              <section
                dangerouslySetInnerHTML={{ __html: content.statementHtml }}
              />
              {content.constraintsHtml && (
                <>
                  <h2>Constraints</h2>
                  <section
                    dangerouslySetInnerHTML={{
                      __html: content.constraintsHtml,
                    }}
                  />
                </>
              )}
              {content.inputSpecificationHtml && (
                <>
                  <h2>Input</h2>
                  <section
                    dangerouslySetInnerHTML={{
                      __html: content.inputSpecificationHtml,
                    }}
                  />
                </>
              )}
              {content.outputSpecificationHtml && (
                <>
                  <h2>Output</h2>
                  <section
                    dangerouslySetInnerHTML={{
                      __html: content.outputSpecificationHtml,
                    }}
                  />
                </>
              )}
              {content.notesHtml && (
                <>
                  <h2>Notes</h2>
                  <section
                    dangerouslySetInnerHTML={{ __html: content.notesHtml }}
                  />
                </>
              )}
            </article>
          ) : (
            <TestCasePanel
              testCases={testCases}
              onTestCasesChange={setTestCases}
              activeTestCaseId={activeTestCaseId}
              onSelectTestCase={setActiveTestCaseId}
              code={code}
              language={language}
            />
          )}
        </div>
      </div>
    </div>
  );
}
