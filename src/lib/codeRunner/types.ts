import type {
  Platform,
  TestResultStatus,
  WasmLoadState,
} from "@/lib/constants";

export type TestCase = {
  id: string;
  input: string;
  expectedOutput: string;
  isCustom?: boolean;
};

export type TestResult = {
  testCaseId: string;
  status: TestResultStatus;
  actualOutput: string;
  error?: string;
  executionTimeMs?: number;
};

export type ExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  timedOut?: boolean;
};

export type ProblemData = {
  title: string;
  platform: Platform;
  contestId: string;
  problemIndex: string;
  url: string;
};

export type WasmLoadStatus = {
  state: WasmLoadState;
  progress: number;
  message: string;
};
