import { describe, expect, it, vi } from "vitest";
import {
  executionKey,
  runTestBatch,
  type ExecutionSnapshot,
} from "./execution";

const snapshot: ExecutionSnapshot = {
  draftId: "room:problem:user",
  language: "python",
  source: "print(2)",
  testCases: [{ id: "sample-1", input: "1", expectedOutput: "2" }],
};
describe("test batches", () => {
  it("keeps the originating inputs when a draft changes while execution is pending", async () => {
    let finish!: (result: {
      stdout: string;
      stderr: string;
      exitCode: number;
      executionTimeMs: number;
    }) => void;
    const execute = vi.fn(
      () =>
        new Promise<Parameters<typeof finish>[0]>((resolve) => {
          finish = resolve;
        }),
    );
    const ready = vi.fn();
    const pending = runTestBatch(snapshot, execute, ready);
    const next = { ...snapshot, draftId: "another problem", source: "changed" };
    expect(executionKey(next)).not.toBe(executionKey(snapshot));
    finish({ stdout: "2\n", stderr: "", exitCode: 0, executionTimeMs: 5 });
    expect(await pending).toEqual([
      {
        testCaseId: "sample-1",
        status: "pass",
        actualOutput: "2\n",
        error: undefined,
        executionTimeMs: 5,
      },
    ]);
    expect(execute).toHaveBeenCalledWith("python", "print(2)", "1", ready);
    for (const changed of [
      { ...snapshot, language: "cpp" as const },
      { ...snapshot, source: "" },
      { ...snapshot, testCases: [{ ...snapshot.testCases[0], input: "3" }] },
    ])
      expect(executionKey(changed)).not.toBe(executionKey(snapshot));
  });
  it("reports failures, timeouts and runtime errors per test without abandoning the batch", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline runtime"))
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: 1,
        timedOut: true,
      })
      .mockResolvedValueOnce({ stdout: "wrong", stderr: "", exitCode: 0 });
    const results = await runTestBatch(
      {
        ...snapshot,
        testCases: ["a", "b", "c"].map((id) => ({
          ...snapshot.testCases[0],
          id,
        })),
      },
      execute,
      () => {},
    );
    expect(results.map((result) => result.status)).toEqual([
      "error",
      "tle",
      "fail",
    ]);
  });
});
