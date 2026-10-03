import type { CodeRunnerLanguage } from "@/lib/constants";
import type {
  ExecutionResult,
  TestCase,
  TestResult,
} from "@/lib/codeRunner/types";

export type RunPhase = "downloading" | "running" | null;
export type ExecutionSnapshot = {
  draftId: string;
  language: CodeRunnerLanguage;
  source: string;
  testCases: TestCase[];
};
export type TestBatch = {
  snapshot: ExecutionSnapshot;
  phase: RunPhase;
  results: TestResult[];
};

export function executionKey(snapshot: ExecutionSnapshot) {
  return JSON.stringify(snapshot);
}

export async function runTestBatch(
  snapshot: ExecutionSnapshot,
  execute: (
    language: CodeRunnerLanguage,
    source: string,
    input: string,
    onReady: () => void,
  ) => Promise<ExecutionResult>,
  onReady: () => void,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  for (const test of snapshot.testCases) {
    try {
      const result = await execute(
        snapshot.language,
        snapshot.source,
        test.input,
        onReady,
      );
      results.push({
        testCaseId: test.id,
        status: result.timedOut
          ? "tle"
          : result.exitCode !== 0 || result.stderr
            ? "error"
            : result.stdout.trim() === test.expectedOutput.trim()
              ? "pass"
              : "fail",
        actualOutput: result.stdout,
        error: result.stderr || undefined,
        executionTimeMs: result.executionTimeMs,
      });
    } catch (error) {
      results.push({
        testCaseId: test.id,
        status: "error",
        actualOutput: "",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  return results;
}
