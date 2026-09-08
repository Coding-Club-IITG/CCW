"use client";

import { useMemo } from "react";
import "katex/dist/katex.min.css";

import type { ContestRoomProblemDto } from "@/lib/contests/dtos";
import { getCodeforcesProblemUrl } from "@/components/contests/roomPresentation";
import { renderProblemMath } from "@/lib/math";

import styles from "./ContestProblemContent.module.scss";

type Props = {
  problem?: ContestRoomProblemDto;
  plain?: boolean;
};

export default function ContestProblemContent({ problem, plain }: Props) {
  const renderedStatementHtml = useMemo(
    () => (problem?.statementHtml ? renderProblemMath(problem.statementHtml) : ""),
    [problem?.statementHtml],
  );
  const renderedInputHtml = useMemo(
    () =>
      problem?.inputSpecificationHtml
        ? renderProblemMath(problem.inputSpecificationHtml)
        : "",
    [problem?.inputSpecificationHtml],
  );
  const renderedOutputHtml = useMemo(
    () =>
      problem?.outputSpecificationHtml
        ? renderProblemMath(problem.outputSpecificationHtml)
        : "",
    [problem?.outputSpecificationHtml],
  );
  const renderedConstraintsHtml = useMemo(
    () =>
      problem?.constraintsHtml
        ? renderProblemMath(problem.constraintsHtml)
        : "",
    [problem?.constraintsHtml],
  );
  const renderedNotesHtml = useMemo(
    () => (problem?.notesHtml ? renderProblemMath(problem.notesHtml) : ""),
    [problem?.notesHtml],
  );

  if (!problem) return null;

  if (!renderedStatementHtml) {
    const cfUrl = problem.problemId
      ? getCodeforcesProblemUrl(problem.problemId) ||
        `https://codeforces.com/problemset/problem/${problem.problemId}`
      : null;

    const notice = (
      <div className={styles.noStatementNotice}>
        <p>Problem statement is not available locally for this problem.</p>
        {cfUrl && (
          <p>
            You can view the full statement on{" "}
            <a href={cfUrl} target="_blank" rel="noreferrer">
              Codeforces ({problem.problemId})
            </a>
            .
          </p>
        )}
      </div>
    );

    if (plain) {
      return <div className={styles.contentPlain}>{notice}</div>;
    }

    return (
      <details className={styles.content} open>
        <summary>Problem statement</summary>
        {notice}
      </details>
    );
  }

  const sections = (
    <>
      <div
        className={styles.section}
        dangerouslySetInnerHTML={{ __html: renderedStatementHtml }}
      />
      {renderedInputHtml && (
        <section className={styles.section}>
          <h3>Input</h3>
          <div
            dangerouslySetInnerHTML={{
              __html: renderedInputHtml,
            }}
          />
        </section>
      )}
      {renderedOutputHtml && (
        <section className={styles.section}>
          <h3>Output</h3>
          <div
            dangerouslySetInnerHTML={{
              __html: renderedOutputHtml,
            }}
          />
        </section>
      )}
      {renderedConstraintsHtml && (
        <section className={styles.section}>
          <h3>Constraints</h3>
          <div dangerouslySetInnerHTML={{ __html: renderedConstraintsHtml }} />
        </section>
      )}
      {renderedNotesHtml && (
        <section className={styles.section}>
          <h3>Notes</h3>
          <div dangerouslySetInnerHTML={{ __html: renderedNotesHtml }} />
        </section>
      )}
    </>
  );

  if (plain) {
    return <div className={styles.contentPlain}>{sections}</div>;
  }

  return (
    <details className={styles.content} open>
      <summary>Problem statement</summary>
      {sections}
    </details>
  );
}
