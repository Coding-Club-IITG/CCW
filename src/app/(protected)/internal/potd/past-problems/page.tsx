import styles from "../Lists.module.scss";
import { getPastProblems } from "@/lib/actions/potd";
import {
  DIFFICULTY_COLORS,
  PLATFORM_DISPLAY_NAMES,
  PLATFORM_PROBLEM_URLS,
} from "@/lib/constants";
import { windowStartToISTDateStr } from "@/lib/potd/utils";

export default async function PastProblemsPage() {
  const result = await getPastProblems(1, 30);
  const pastProblems = result.data ?? [];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Past Problems</h1>
        <p>A history of all previous Problems of the Day.</p>
      </div>

      {pastProblems.length === 0 ? (
        <p style={{ color: "var(--muted)", padding: "2rem 0" }}>
          No past problems yet.
        </p>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Problem</th>
                <th>Platform</th>
                <th>Rating</th>
                <th>Difficulty</th>
                <th>Solved By</th>
              </tr>
            </thead>
            <tbody>
              {pastProblems.map((p) => {
                const dateLabel = new Date(
                  windowStartToISTDateStr(p.windowStart) + "T00:00:00Z",
                ).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                });
                const problemUrl = PLATFORM_PROBLEM_URLS[p.platform](
                  p.problem.contestId,
                  p.problem.problemIndex,
                );

                return (
                  <tr key={p.challengeId}>
                    <td className={styles.subText}>{dateLabel}</td>
                    <td>
                      <a
                        href={problemUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.problemTitle}
                      >
                        {p.problem.name}
                      </a>
                    </td>
                    <td className={styles.subText}>
                      {PLATFORM_DISPLAY_NAMES[p.platform]}
                    </td>
                    <td>
                      <span className={styles.rating}>
                        {p.problem.rating || "Unrated"}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          color: DIFFICULTY_COLORS[p.difficulty],
                          padding: "2px 8px",
                          borderRadius: "999px",
                          border: `1px solid ${DIFFICULTY_COLORS[p.difficulty]}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.difficulty}
                      </span>
                    </td>
                    <td className={styles.boldText}>{p.solvedBy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
