import type { ContestRoomProblemDto } from "@/lib/contests/dtos";

import styles from "./ContestProblemContent.module.scss";

type Props = {
  problem?: ContestRoomProblemDto;
};

export default function ContestProblemContent({ problem }: Props) {
  if (!problem?.statementHtml) return null;

  return (
    <details className={styles.content} open>
      <summary>Problem statement</summary>
      <div
        className={styles.section}
        dangerouslySetInnerHTML={{ __html: problem.statementHtml }}
      />
      {problem.inputSpecificationHtml && (
        <section className={styles.section}>
          <h3>Input</h3>
          <div
            dangerouslySetInnerHTML={{
              __html: problem.inputSpecificationHtml,
            }}
          />
        </section>
      )}
      {problem.outputSpecificationHtml && (
        <section className={styles.section}>
          <h3>Output</h3>
          <div
            dangerouslySetInnerHTML={{
              __html: problem.outputSpecificationHtml,
            }}
          />
        </section>
      )}
      {problem.constraintsHtml && (
        <section className={styles.section}>
          <h3>Constraints</h3>
          <div dangerouslySetInnerHTML={{ __html: problem.constraintsHtml }} />
        </section>
      )}
      {problem.notesHtml && (
        <section className={styles.section}>
          <h3>Notes</h3>
          <div dangerouslySetInnerHTML={{ __html: problem.notesHtml }} />
        </section>
      )}
    </details>
  );
}
