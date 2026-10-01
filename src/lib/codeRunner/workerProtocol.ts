import type { CodeRunnerLanguage } from "@/lib/constants";
import type { ExecutionResult } from "@/lib/codeRunner/types";

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
