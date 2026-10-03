"use client";

import { useState, useEffect, useRef } from "react";
import {
  Play as IconPlay,
  Check as IconCheck,
  X as IconX,
  Plus as IconPlus,
} from "lucide-react";

import type { TestCase, TestResult } from "@/lib/codeRunner/types";
import type { RunPhase } from "./execution";

import styles from "./CodeRunner.module.scss";

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
  runPhase: RunPhase;
  results: TestResult[];
  onRun: () => void;
  busy: boolean;
};

export default function TestCasePanel({
  testCases,
  onTestCasesChange,
  activeTestCaseId,
  onSelectTestCase,
  runPhase,
  results,
  onRun,
  busy,
}: Props) {
  const handleAddTestCase = () => {
    const newCase: TestCase = {
      id: `custom-${crypto.randomUUID()}`,
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
          onClick={onRun}
          disabled={busy || testCases.length === 0}
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
            <div key={tc.id} className={styles.testTabGroup}>
              <button
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
                      <IconX
                        width="12"
                        height="12"
                        className={styles.failIcon}
                      />
                    )}
                  </span>
                )}
                Test {idx + 1}
              </button>
              {tc.isCustom && (
                <button
                  type="button"
                  className={styles.removeTestCase}
                  aria-label={`Remove test ${idx + 1}`}
                  onClick={() => handleRemoveTestCase(tc.id)}
                >
                  <IconX width="12" height="12" />
                </button>
              )}
            </div>
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
            <label htmlFor="runner-test-input">Input</label>
            <textarea
              id="runner-test-input"
              value={activeTestCase.input}
              onChange={(e) =>
                handleUpdateTestCase(activeTestCase.id, "input", e.target.value)
              }
              placeholder="Enter input..."
              rows={3}
            />
          </div>
          <div className={styles.testCaseField}>
            <label htmlFor="runner-test-expected">Expected Output</label>
            <textarea
              id="runner-test-expected"
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
