/**
 * Code execution abstraction for code in the browser via WASM
 * Lazily loads WASM runtimes on first use and caches them.
 */

import type { CodeRunnerLanguage, ExecutionResult } from "@/lib/constants";
import { CODE_RUNNER_TIMEOUT_MS } from "@/lib/constants";

import { executeCpp } from "./cpp-executor";
import { executePython } from "./python-executor";

export async function executeCode(
  language: CodeRunnerLanguage,
  sourceCode: string,
  stdin: string,
): Promise<ExecutionResult> {
  const timeout = CODE_RUNNER_TIMEOUT_MS[language];

  switch (language) {
    case "cpp":
      return executeCpp(sourceCode, stdin, timeout);
    case "python":
      return executePython(sourceCode, stdin, timeout);
    default:
      return {
        stdout: "",
        stderr: `Unsupported language: ${language}`,
        exitCode: 1,
        executionTimeMs: 0,
      };
  }
}
