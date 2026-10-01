import { executeCpp } from "@/lib/codeRunner/cppExecutor";
import { executePython } from "@/lib/codeRunner/pythonExecutor";
import type {
  RunnerWorkerRequest,
  RunnerWorkerResponse,
} from "@/lib/codeRunner/workerProtocol";

function send(message: RunnerWorkerResponse) {
  self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<RunnerWorkerRequest>) => {
  const { id, language, sourceCode, stdin, timeoutMs } = event.data;
  const onExecutionStart = () => send({ id, type: "execution-started" });

  const result =
    language === "cpp"
      ? await executeCpp(sourceCode, stdin, timeoutMs, onExecutionStart)
      : await executePython(sourceCode, stdin, timeoutMs, onExecutionStart);

  send({ id, type: "result", result });
};
