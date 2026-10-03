import { afterEach, describe, expect, it, vi } from "vitest";
import { CODE_RUNNER_DEFAULT_CODE } from "@/lib/constants";
import {
  contestDraftIdentity,
  RunnerDraftStore,
  solveDraftIdentity,
} from "./drafts";

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  const failure = vi.fn();
  const store = new RunnerDraftStore(() => storage, failure);
  return { values, storage, failure, store };
}
const samples = [{ input: "1", output: "2" }];
afterEach(() => vi.useRealTimers());

describe("runner drafts", () => {
  it("preserves original Solve keys, including saved empty code", () => {
    const { store, values } = setup();
    const identity = solveDraftIdentity({
      platform: "codeforces",
      contestId: "1",
      problemIndex: "A",
    });
    values.set("solve-code-codeforces-1-A-cpp", "");
    const draft = store.read(identity, samples);
    expect(draft.code.cpp).toBe("");
    expect(draft.code.python).toBe(CODE_RUNNER_DEFAULT_CODE.python);
    expect(solveDraftIdentity().codeKey).toBe("solve-code-scratch");
  });

  it("flushes edits for several identities before debounce, with language and custom tests", () => {
    vi.useFakeTimers();
    const { store, storage, failure } = setup();
    const first = contestDraftIdentity("user", "room", "1A");
    const second = contestDraftIdentity("user", "room", "2B");
    const draft = store.read(first, samples);
    const testCases = [
      { ...draft.testCases[0], input: "edited" },
      {
        id: "custom-1",
        input: "custom",
        expectedOutput: "yes",
        isCustom: true,
      },
    ];
    store.update(first, {
      ...draft,
      code: { cpp: "", python: "print(2)" },
      language: "python",
      testCases,
      activeTestCaseId: "custom-1",
    });
    store.update(second, {
      ...store.read(second, []),
      code: { cpp: "B", python: "" },
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    store.flush();
    const restored = new RunnerDraftStore(() => storage, failure);
    expect(restored.read(first, samples)).toEqual({
      ...draft,
      code: { cpp: "", python: "print(2)" },
      language: "python",
      testCases,
      activeTestCaseId: "custom-1",
    });
    expect(restored.read(second, samples).code.cpp).toBe("B");
    expect(
      restored.read(contestDraftIdentity("other", "room", "1A"), samples).code
        .cpp,
    ).toBe(CODE_RUNNER_DEFAULT_CODE.cpp);
    expect(
      restored.read(contestDraftIdentity("user", "other", "1A"), samples).code
        .cpp,
    ).toBe(CODE_RUNNER_DEFAULT_CODE.cpp);
    vi.runAllTimers();
  });

  it("debounces saves and preserves drafts when storage becomes unavailable", () => {
    vi.useFakeTimers();
    const { store, storage, failure } = setup();
    const identity = solveDraftIdentity();
    const initial = store.read(identity, samples);
    storage.setItem.mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    const changed = {
      ...initial,
      code: { ...initial.code, cpp: "" },
      testCases: [],
    };
    store.update(identity, changed);
    vi.advanceTimersByTime(500);
    expect(failure).toHaveBeenCalledOnce();
    expect(store.read(identity, samples)).toBe(changed);
    storage.setItem.mockImplementation(() => {});
    store.flush();
    expect(storage.setItem).toHaveBeenCalledWith("solve-code-scratch-cpp", "");
  });

  it("handles storage getter failure and corrupt metadata without losing readable legacy code", () => {
    const failure = vi.fn();
    const blocked = new RunnerDraftStore(() => {
      throw new Error("SecurityError");
    }, failure);
    expect(blocked.read(solveDraftIdentity(), samples).testCases).toHaveLength(
      1,
    );
    expect(failure).toHaveBeenCalledOnce();
    const { store, values } = setup();
    values.set("solve-code-scratch-python", "saved");
    values.set("solve-draft-scratch", '{"version":1,"testCases":[{}]}');
    expect(store.read(solveDraftIdentity(), samples).code.python).toBe("saved");
  });
});
