/**
 * Code execution abstraction via WASM Worker
 * Runtimes stay cached in the worker without blocking the UI thread
 */

import type { CodeRunnerLanguage, ExecutionResult } from "@/lib/constants";
import { CODE_RUNNER_TIMEOUT_MS } from "@/lib/constants";

import type {
  RunnerWorkerRequest,
  RunnerWorkerResponse,
} from "./workerProtocol";

const SETUP_TIMEOUT_MS = 120_000;

type ActiveRun = {
  id: number;
  timeoutMs: number;
  resolve: (result: ExecutionResult) => void;
  onExecutionStart?: () => void;
  setupTimer: ReturnType<typeof setTimeout>;
  executionTimer?: ReturnType<typeof setTimeout>;
};

let worker: Worker | null = null;
let activeRun: ActiveRun | null = null;
let nextRunId = 1;
let executionQueue: Promise<void> = Promise.resolve();

function clearRunTimers(run: ActiveRun) {
  clearTimeout(run.setupTimer);
  if (run.executionTimer) clearTimeout(run.executionTimer);
}

function resetWorker() {
  worker?.terminate();
  worker = null;
}

function finishActiveRun(result: ExecutionResult) {
  if (!activeRun) return;
  const run = activeRun;
  activeRun = null;
  clearRunTimers(run);
  run.resolve(result);
}

function failWorker(message: string) {
  resetWorker();
  finishActiveRun({
    stdout: "",
    stderr: message,
    exitCode: 1,
    executionTimeMs: 0,
  });
}

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<RunnerWorkerResponse>) => {
    if (!activeRun || event.data.id !== activeRun.id) return;

    if (event.data.type === "execution-started") {
      clearTimeout(activeRun.setupTimer);
      activeRun.onExecutionStart?.();
      activeRun.executionTimer = setTimeout(() => {
        const timeoutMs = activeRun?.timeoutMs ?? 0;
        resetWorker();
        finishActiveRun({
          stdout: "",
          stderr: "Time Limit Exceeded",
          exitCode: 1,
          executionTimeMs: timeoutMs,
          timedOut: true,
        });
      }, activeRun.timeoutMs);
      return;
    }

    finishActiveRun(event.data.result);
  };
  worker.onerror = () => {
    failWorker("The local code runner stopped unexpectedly");
  };

  return worker;
}

function executeInWorker(
  language: CodeRunnerLanguage,
  sourceCode: string,
  stdin: string,
  onExecutionStart?: () => void,
): Promise<ExecutionResult> {
  const timeoutMs = CODE_RUNNER_TIMEOUT_MS[language];
  const id = nextRunId++;

  return new Promise((resolve) => {
    const setupTimer = setTimeout(() => {
      resetWorker();
      finishActiveRun({
        stdout: "",
        stderr: "The local compiler or runtime took too long to load",
        exitCode: 1,
        executionTimeMs: 0,
      });
    }, SETUP_TIMEOUT_MS);

    activeRun = { id, timeoutMs, resolve, setupTimer, onExecutionStart };
    const request: RunnerWorkerRequest = {
      id,
      language,
      sourceCode,
      stdin,
      timeoutMs,
    };
    getWorker().postMessage(request);
  });
}

export function executeCode(
  language: CodeRunnerLanguage,
  sourceCode: string,
  stdin: string,
  onExecutionStart?: () => void,
): Promise<ExecutionResult> {
  const queuedRun = executionQueue.then(
    () => executeInWorker(language, sourceCode, stdin, onExecutionStart),
    () => executeInWorker(language, sourceCode, stdin, onExecutionStart),
  );
  executionQueue = queuedRun.then(
    () => undefined,
    () => undefined,
  );
  return queuedRun;
}
