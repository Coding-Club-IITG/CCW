import "katex/dist/katex.min.css";
import styles from "./Workspace.module.scss";

export type ProblemContent = {
  statementHtml: string;
  inputSpecificationHtml?: string;
  outputSpecificationHtml?: string;
  constraintsHtml?: string;
  notesHtml?: string;
  samples: Array<{ input: string; output: string }>;
  timeLimitMs?: number;
  memoryLimitMb?: number;
};

export default function ProblemStatement({
  content,
}: {
  content: ProblemContent;
}) {
  return (
    <article className={styles.problemStatement}>
      {(content.timeLimitMs || content.memoryLimitMb) && (
        <div className={styles.problemLimits}>
          {content.timeLimitMs && (
            <span>Time: {content.timeLimitMs / 1000}s</span>
          )}
          {content.memoryLimitMb && (
            <span>Memory: {content.memoryLimitMb} MB</span>
          )}
        </div>
      )}
      {content.statementHtml ? (
        <section dangerouslySetInnerHTML={{ __html: content.statementHtml }} />
      ) : (
        <p>
          Problem statement is not available locally. Use the problem link to
          view it on the platform.
        </p>
      )}
      {(
        [
          ["Constraints", content.constraintsHtml],
          ["Input", content.inputSpecificationHtml],
          ["Output", content.outputSpecificationHtml],
          ["Notes", content.notesHtml],
        ] as const
      ).map(
        ([title, html]) =>
          html && (
            <section key={title}>
              <h2>{title}</h2>
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </section>
          ),
      )}
      {content.samples.length > 0 && (
        <section>
          <h2>Examples</h2>
          {content.samples.map((sample, index) => (
            <div key={index}>
              <h3>Input {index + 1}</h3>
              <pre>{sample.input}</pre>
              <h3>Output {index + 1}</h3>
              <pre>{sample.output}</pre>
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
