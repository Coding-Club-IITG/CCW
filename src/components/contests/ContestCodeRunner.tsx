"use client";

import { useEffect, useState } from "react";

import {
  CODE_RUNNER_DEFAULT_CODE,
  type CodeRunnerLanguage,
  type TestCase,
} from "@/lib/constants";
import {
  CodeEditor,
  LanguageSelector,
  TestCasePanel,
} from "@/components/shared/code-runner";

import styles from "@/components/shared/code-runner/CodeRunner.module.scss";

type Props = {
  problemId?: string;
  samples?: Array<{ input: string; output: string }>;
};

/** A local runner: code never leaves the participant's browser. */
export default function ContestCodeRunner({ problemId, samples }: Props) {
  const [language, setLanguage] = useState<CodeRunnerLanguage>("cpp");
  const [codeByLanguage, setCodeByLanguage] = useState<
    Record<CodeRunnerLanguage, string>
  >({ ...CODE_RUNNER_DEFAULT_CODE });
  const [testCases, setTestCases] = useState<TestCase[]>(() =>
    samples?.length
      ? samples.map((sample, index) => ({
          id: `sample-${index + 1}`,
          input: sample.input,
          expectedOutput: sample.output,
        }))
      : [{ id: "sample-1", input: "", expectedOutput: "" }],
  );
  const [activeTestCaseId, setActiveTestCaseId] = useState(
    testCases[0]?.id || "sample-1",
  );

  useEffect(() => {
    const nextTestCases: TestCase[] = samples?.length
      ? samples.map((sample, index) => ({
          id: `${problemId || "sample"}-${index + 1}`,
          input: sample.input,
          expectedOutput: sample.output,
        }))
      : [{ id: `${problemId || "sample"}-1`, input: "", expectedOutput: "" }];
    setTestCases(nextTestCases);
    setActiveTestCaseId(nextTestCases[0].id);
  }, [problemId, samples]);

  return (
    <details className={styles.contestRunner}>
      <summary>Open local code runner</summary>
      <p className={styles.runnerNotice}>
        Runs locally in your browser for testing only. Submit solutions on
        Codeforces for scoring.
      </p>
      <LanguageSelector language={language} onChange={setLanguage} />
      <div className={styles.contestEditor}>
        <CodeEditor
          language={language}
          value={codeByLanguage[language]}
          onChange={(value) =>
            setCodeByLanguage((previous) => ({
              ...previous,
              [language]: value,
            }))
          }
        />
      </div>
      <TestCasePanel
        testCases={testCases}
        onTestCasesChange={setTestCases}
        activeTestCaseId={activeTestCaseId}
        onSelectTestCase={setActiveTestCaseId}
        code={codeByLanguage[language]}
        language={language}
      />
    </details>
  );
}
