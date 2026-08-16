import { executeCpp } from "./cpp-executor";
import { executePython } from "./python-executor";
import type {
  RunnerWorkerRequest,
  RunnerWorkerResponse,
} from "./workerProtocol";

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
