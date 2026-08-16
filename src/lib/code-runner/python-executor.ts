/**
 * Python execution via Pyodide (CPython compiled to WASM)
 * Loads Pyodide runtime lazily on first use.
 */

import type { ExecutionResult } from "@/lib/constants";

let pyodideInstance: any = null;

async function loadPyodide() {
  if (pyodideInstance) return pyodideInstance;

  const { loadPyodide: load } = await import("pyodide");
  pyodideInstance = await load({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
  });
  return pyodideInstance;
}

export async function executePython(
  source: string,
  stdin: string,
  timeoutMs: number,
  onExecutionStart?: () => void,
): Promise<ExecutionResult> {
  let executionStart: number | null = null;

  try {
    const pyodide = await loadPyodide();

    // Set up stdin simulation
    const stdinLines = stdin.split("\n");
    let stdinIndex = 0;

    pyodide.setStdin({
      stdin: () => {
        if (stdinIndex < stdinLines.length) {
          return stdinLines[stdinIndex++];
        }
        return undefined;
      },
    });

    // Capture stdout/stderr
    let stdout = "";
    let stderr = "";

    pyodide.setStdout({
      batched: (text: string) => {
        stdout += text + "\n";
      },
    });
    pyodide.setStderr({
      batched: (text: string) => {
        stderr += text + "\n";
      },
    });

    // Measure execution time
    executionStart = performance.now();
    onExecutionStart?.();
    const runPromise = pyodide.runPythonAsync(source);

    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), timeoutMs),
    );

    const result = await Promise.race([runPromise, timeoutPromise]);

    if (result === "timeout") {
      return {
        stdout,
        stderr: "Time Limit Exceeded",
        exitCode: 1,
        executionTimeMs: timeoutMs,
        timedOut: true,
      };
    }

    return {
      stdout,
      stderr,
      exitCode: stderr ? 1 : 0,
      executionTimeMs: Math.round(performance.now() - executionStart),
    };
  } catch (err) {
    return {
      stdout: "",
      stderr: err instanceof Error ? err.message : "Runtime error",
      exitCode: 1,
      executionTimeMs:
        executionStart === null
          ? 0
          : Math.round(performance.now() - executionStart),
    };
  }
}
