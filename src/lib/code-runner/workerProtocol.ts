import type { CodeRunnerLanguage, ExecutionResult } from "@/lib/constants";

export type RunnerWorkerRequest = {
  id: number;
  language: CodeRunnerLanguage;
  sourceCode: string;
  stdin: string;
  timeoutMs: number;
};

export type RunnerWorkerResponse =
  | { id: number; type: "execution-started" }
  | { id: number; type: "result"; result: ExecutionResult };
