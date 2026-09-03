"use client";

import { useEffect, useRef, useState } from "react";

import { getPastProblems, type PastProblemEntry } from "@/lib/actions/potd";
import { PLATFORM_DISPLAY_NAMES, PLATFORM_PROBLEM_URLS } from "@/lib/constants";
import { windowStartToISTDateStr } from "@/lib/potd/utils";

import EmptyState from "@/components/shared/EmptyState";
import Pagination from "@/components/shared/Pagination";
import SearchInput from "@/components/shared/SearchInput";

import styles from "../Lists.module.scss";

const PAGE_SIZE = 30;

type Props = {
  initialPastProblems: PastProblemEntry[];
  initialTotal: number;
};

const DIFFICULTY_CLASS_NAMES: Record<PastProblemEntry["difficulty"], string> = {
  Easy: styles.difficultyEasy,
  Medium: styles.difficultyMedium,
  Hard: styles.difficultyHard,
};

export default function PastProblemsClient({
  initialPastProblems,
  initialTotal,
}: Props) {
  const [pastProblems, setPastProblems] = useState(initialPastProblems);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.max(1, Math.ceil(initialTotal / PAGE_SIZE)),
  );
  const [isLoading, setIsLoading] = useState(false);
  const hasMountedRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    void getPastProblems(page, PAGE_SIZE, search)
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        if (!result.ok) return;
        setPastProblems(result.data.items ?? []);
        setTotalPages(
          Math.max(1, Math.ceil((result.data.total ?? 0) / PAGE_SIZE)),
        );
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      });
  }, [search, page]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Past Problems</h1>
        <p>A history of all previous Problems of the Day.</p>
      </div>

      <div className={styles.headerActions}>
        <SearchInput
          placeholder="Search past problems..."
          onSearch={(value) => {
            setSearch(value.trim());
            setPage(1);
          }}
          className={styles.searchInput}
        />
        {isLoading ? <p className={styles.subText}>Searching...</p> : null}
      </div>

      {pastProblems.length === 0 ? (
        <EmptyState
          title={
            search
              ? "No past problems match your search."
              : "No past problems yet."
          }
        />
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table} aria-busy={isLoading}>
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
              {pastProblems.map((problem) => {
                const dateLabel = new Date(
                  `${windowStartToISTDateStr(problem.windowStart)}T00:00:00Z`,
                ).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                });
                const problemUrl = PLATFORM_PROBLEM_URLS[problem.platform](
                  problem.problem.contestId,
                  problem.problem.problemIndex,
                );

                return (
                  <tr key={problem.challengeId}>
                    <td className={styles.subText}>{dateLabel}</td>
                    <td>
                      <a
                        href={problemUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.problemTitle}
                      >
                        {problem.problem.name}
                      </a>
                    </td>
                    <td className={styles.subText}>
                      {PLATFORM_DISPLAY_NAMES[problem.platform]}
                    </td>
                    <td>
                      <span className={styles.rating}>
                        {problem.problem.rating || "Unrated"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles.difficultyBadge} ${DIFFICULTY_CLASS_NAMES[problem.difficulty]}`}
                      >
                        {problem.difficulty}
                      </span>
                    </td>
                    <td className={styles.boldText}>{problem.solvedBy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
