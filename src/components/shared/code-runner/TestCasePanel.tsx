"use client";

import { useState, useEffect, useRef } from "react";
import type { TestCase, TestResult, CodeRunnerLanguage } from "@/lib/constants";
import { executeCode } from "@/lib/code-runner/executor";
import {
  Play as IconPlay,
  Check as IconCheck,
  X as IconX,
  Plus as IconPlus,
} from "lucide-react";
import styles from "./CodeRunner.module.scss";

type RunPhase = "downloading" | "running" | null;

function AnimatedDots() {
  const [dots, setDots] = useState(".");
  const interval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    interval.current = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 400);
    return () => {
      if (interval.current) clearInterval(interval.current);
    };
  }, []);

  return <span className={styles.animatedDots}>{dots}</span>;
}

type Props = {
  testCases: TestCase[];
  onTestCasesChange: (testCases: TestCase[]) => void;
  activeTestCaseId: string | null;
  onSelectTestCase: (id: string) => void;
  code: string;
  language: CodeRunnerLanguage;
};

export default function TestCasePanel({
  testCases,
  onTestCasesChange,
  activeTestCaseId,
  onSelectTestCase,
  code,
  language,
}: Props) {
  const [runPhase, setRunPhase] = useState<RunPhase>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const runtimeLoaded = useRef<Record<string, boolean>>({});

  const handleRunAll = async () => {
    if (testCases.length === 0) return;
    setResults([]);

    // Show "Downloading" if runtime not yet loaded
    if (!runtimeLoaded.current[language]) {
      setRunPhase("downloading");
    } else {
      setRunPhase("running");
    }

    const newResults: TestResult[] = [];

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      try {
        const result = await executeCode(language, code, tc.input, () => {
          runtimeLoaded.current[language] = true;
          setRunPhase("running");
        });

        const actualTrimmed = result.stdout.trim();
        const expectedTrimmed = tc.expectedOutput.trim();

        let status: TestResult["status"];
        if (result.timedOut) {
          status = "tle";
        } else if (result.exitCode !== 0 || result.stderr) {
          status = "error";
        } else if (actualTrimmed === expectedTrimmed) {
          status = "pass";
        } else {
          status = "fail";
        }

        newResults.push({
          testCaseId: tc.id,
          status,
          actualOutput: result.stdout,
          error: result.stderr || undefined,
          executionTimeMs: result.executionTimeMs,
        });
      } catch (err) {
        newResults.push({
          testCaseId: tc.id,
          status: "error",
          actualOutput: "",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    setResults(newResults);
    setRunPhase(null);
  };

  const handleAddTestCase = () => {
    const newCase: TestCase = {
      id: `custom-${Date.now()}`,
      input: "",
      expectedOutput: "",
      isCustom: true,
    };
    onTestCasesChange([...testCases, newCase]);
    onSelectTestCase(newCase.id);
  };

  const handleRemoveTestCase = (id: string) => {
    const updated = testCases.filter((tc) => tc.id !== id);
    onTestCasesChange(updated);
    if (activeTestCaseId === id) {
      onSelectTestCase(updated[0]?.id ?? "");
    }
  };

  const handleUpdateTestCase = (
    id: string,
    field: "input" | "expectedOutput",
    value: string,
  ) => {
    onTestCasesChange(
      testCases.map((tc) => (tc.id === id ? { ...tc, [field]: value } : tc)),
    );
  };

  const getResultForTestCase = (id: string) =>
    results.find((r) => r.testCaseId === id);

  const passCount = results.filter((r) => r.status === "pass").length;
  const totalCount = results.length;

  const activeTestCase = testCases.find((t) => t.id === activeTestCaseId);
  const activeResult = activeTestCaseId
    ? getResultForTestCase(activeTestCaseId)
    : undefined;

  return (
    <div className={styles.testCasePanel}>
      {/* Run button */}
      <div className={styles.runnerHeader}>
        <button
          className={styles.runBtn}
          onClick={handleRunAll}
          disabled={runPhase !== null || testCases.length === 0}
          type="button"
        >
          {runPhase === null && (
            <>
              <IconPlay width="14" height="14" />
              Run Tests
            </>
          )}
          {runPhase === "downloading" && (
            <>
              Downloading
              <AnimatedDots />
            </>
          )}
          {runPhase === "running" && (
            <>
              Running
              <AnimatedDots />
            </>
          )}
        </button>
        {totalCount > 0 && (
          <span
            className={`${styles.resultSummary} ${passCount === totalCount ? styles.allPass : styles.someFail}`}
          >
            {passCount}/{totalCount} passed
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.testCaseTabs}>
        {testCases.map((tc, idx) => {
          const result = getResultForTestCase(tc.id);
          return (
            <button
              key={tc.id}
              className={`${styles.testCaseTab} ${activeTestCaseId === tc.id ? styles.testCaseTabActive : ""}`}
              onClick={() => onSelectTestCase(tc.id)}
              type="button"
            >
              {result && (
                <span className={styles.testCaseStatusIcon}>
                  {result.status === "pass" ? (
                    <IconCheck
                      width="12"
                      height="12"
                      className={styles.passIcon}
                    />
                  ) : (
                    <IconX width="12" height="12" className={styles.failIcon} />
                  )}
                </span>
              )}
              Test {idx + 1}
              {tc.isCustom && (
                <span
                  className={styles.removeTestCase}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTestCase(tc.id);
                  }}
                >
                  <IconX width="10" height="10" />
                </span>
              )}
            </button>
          );
        })}
        <button
          className={styles.addTestCaseBtn}
          onClick={handleAddTestCase}
          type="button"
          aria-label="Add test case"
        >
          <IconPlus width="14" height="14" />
        </button>
      </div>

      {/* Active test case content */}
      {activeTestCase && (
        <div className={styles.testCaseContent}>
          <div className={styles.testCaseField}>
            <label>Input</label>
            <textarea
              value={activeTestCase.input}
              onChange={(e) =>
                handleUpdateTestCase(activeTestCase.id, "input", e.target.value)
              }
              placeholder="Enter input..."
              rows={3}
            />
          </div>
          <div className={styles.testCaseField}>
            <label>Expected Output</label>
            <textarea
              value={activeTestCase.expectedOutput}
              onChange={(e) =>
                handleUpdateTestCase(
                  activeTestCase.id,
                  "expectedOutput",
                  e.target.value,
                )
              }
              placeholder="Enter expected output..."
              rows={3}
            />
          </div>
          {activeResult && (
            <div className={styles.testCaseField}>
              <label>
                Received Output
                {activeResult.executionTimeMs !== undefined && (
                  <span className={styles.resultTime}>
                    {" "}
                    ({activeResult.executionTimeMs}ms)
                  </span>
                )}
              </label>
              <pre
                className={
                  activeResult.status === "pass"
                    ? styles.outputPass
                    : activeResult.status === "error"
                      ? styles.outputError
                      : styles.outputFail
                }
              >
                {activeResult.error || activeResult.actualOutput || "(empty)"}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
