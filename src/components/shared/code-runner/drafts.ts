import {
  CODE_RUNNER_DEFAULT_CODE,
  CODE_RUNNER_LANGUAGES,
  type CodeRunnerLanguage,
} from "@/lib/constants";
import type { TestCase } from "@/lib/codeRunner/types";

export type DraftIdentity = {
  /** Stable, scoped identity */
  codeKey: string;
  stateKey: string;
};

export function solveDraftIdentity(problem?: {
  platform: string;
  contestId: string;
  problemIndex: string;
}): DraftIdentity {
  const suffix = problem
    ? `${problem.platform}-${problem.contestId}-${problem.problemIndex}`
    : "scratch";
  return { codeKey: `solve-code-${suffix}`, stateKey: `solve-draft-${suffix}` };
}

export function contestDraftIdentity(
  userId: string,
  roomId: string,
  problemId: string,
): DraftIdentity {
  const key = `contest-draft-${[userId, roomId, problemId].map(encodeURIComponent).join(":")}`;
  return { codeKey: `${key}-code`, stateKey: key };
}

export type RunnerDraft = {
  language: CodeRunnerLanguage;
  code: Record<CodeRunnerLanguage, string>;
  testCases: TestCase[];
  activeTestCaseId: string | null;
};

type StorageAccess = () => Pick<Storage, "getItem" | "setItem">;

function validTests(value: unknown): value is TestCase[] {
  return (
    Array.isArray(value) &&
    value.every(
      (test) =>
        test &&
        typeof test.id === "string" &&
        typeof test.input === "string" &&
        typeof test.expectedOutput === "string" &&
        (test.isCustom === undefined || typeof test.isCustom === "boolean"),
    ) &&
    new Set(value.map((test) => test.id)).size === value.length
  );
}

/** Browser persistence with an in-memory fallback */
export class RunnerDraftStore {
  private drafts = new Map<string, RunnerDraft>();
  private pending = new Map<string, DraftIdentity>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private storage: StorageAccess,
    private onFailure: () => void,
  ) {}

  read(
    identity: DraftIdentity,
    samples: Array<{ input: string; output: string }>,
  ): RunnerDraft {
    const cached = this.drafts.get(identity.stateKey);
    if (cached) return cached;
    const testCases = samples.map((sample, index) => ({
      id: `sample-${index + 1}`,
      input: sample.input,
      expectedOutput: sample.output,
      isCustom: false,
    }));
    const draft: RunnerDraft = {
      language: "cpp",
      code: { ...CODE_RUNNER_DEFAULT_CODE },
      testCases,
      activeTestCaseId: testCases[0]?.id ?? null,
    };
    try {
      const storage = this.storage();
      for (const language of CODE_RUNNER_LANGUAGES) {
        const saved = storage.getItem(`${identity.codeKey}-${language}`);
        if (saved !== null) draft.code[language] = saved;
      }
      const raw = storage.getItem(identity.stateKey);
      if (raw !== null) {
        const saved = JSON.parse(raw);
        if (
          saved?.version !== 1 ||
          !validTests(saved.testCases) ||
          !CODE_RUNNER_LANGUAGES.includes(saved.language)
        )
          throw new Error("Invalid draft");
        draft.language = saved.language;
        draft.testCases = saved.testCases;
        draft.activeTestCaseId = draft.testCases.some(
          (test) => test.id === saved.activeTestCaseId,
        )
          ? saved.activeTestCaseId
          : (draft.testCases[0]?.id ?? null);
      }
    } catch {
      this.onFailure();
    }
    this.drafts.set(identity.stateKey, draft);
    return draft;
  }

  update(identity: DraftIdentity, draft: RunnerDraft) {
    this.drafts.set(identity.stateKey, draft);
    this.pending.set(identity.stateKey, identity);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
    return draft;
  }

  flush = () => {
    clearTimeout(this.timer);
    for (const [key, identity] of this.pending) {
      const draft = this.drafts.get(key)!;
      try {
        const storage = this.storage();
        for (const language of CODE_RUNNER_LANGUAGES) {
          storage.setItem(
            `${identity.codeKey}-${language}`,
            draft.code[language],
          );
        }
        storage.setItem(
          identity.stateKey,
          JSON.stringify({
            version: 1,
            language: draft.language,
            testCases: draft.testCases,
            activeTestCaseId: draft.activeTestCaseId,
          }),
        );
        this.pending.delete(key);
      } catch {
        this.onFailure();
      }
    }
  };
}
