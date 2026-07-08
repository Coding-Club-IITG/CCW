"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/shared/BackLink";
import { getDisplayName } from "@/lib/utils";
import styles from "./PostMatchResultClient.module.scss";

export type MatchData = {
  roomType: string;
  duration: string;
  teams: {
    id: string;
    name: string;
    score: number;
    members: {
      id: string;
      name: string;
      handle: string;
      avatar: string;
      pizza_count: number;
      contribution?: number;
    }[];
  }[];
  problems: {
    id: string;
    name: string;
    rating: number;
    points: number;
    solved: boolean;
    solver: {
      userId: string;
      userName: string;
      pizza_count: number;
      userAvatar: string;
      teamId: string;
      teamName: string;
      solveMs: number;
    } | null;
  }[];
  mvp: {
    userId: string;
    name: string;
    pizza_count: number;
    avatar: string;
    teamName: string;
    contribution: number;
  } | null;
  isKnockout: boolean;
  contestId?: string;
  terminationReason?: string;
  format?: string;
  isProcessing?: boolean;
};

export default function PostMatchResultClient({
  matchData,
  currentUserId,
  from,
}: {
  matchData: MatchData;
  currentUserId?: string;
  from?: string;
}) {
  let backHref = "/internal/contests/history";
  let backText = "Back to Match History";

  if (from === "listing") {
    backHref = "/internal/contests";
    backText = "Back to Contest Listing";
  } else if (from === "bracket" && matchData.contestId) {
    backHref = `/internal/contests/${matchData.contestId}`;
    backText = "Back to Bracket Canvas";
  }

  const router = useRouter();

  useEffect(() => {
    if (matchData.isProcessing) {
      const interval = setInterval(() => {
        router.refresh();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [matchData.isProcessing, router]);

  if (matchData.isProcessing) {
    return (
      <div className={styles.processing}>
        <span className={`material-symbols-outlined ${styles.processingIcon}`}>
          sync
        </span>
        <p className={styles.processingText}>Calculating match results...</p>
      </div>
    );
  }

  const currentUserTeam = matchData.teams.find((t) =>
    t.members.some((m) => m.id === currentUserId),
  );

  const getProblemUrl = (problemId: string) => {
    const match = problemId.match(/^(\d+)([A-Za-z].*)$/);
    if (match) {
      return `https://codeforces.com/problemset/problem/${match[1]}/${match[2]}`;
    }
    return `https://codeforces.com/problemset/problem/${problemId}`; // fallback
  };

  const isSoloFormat = ["1v1", "solo-tournament"].includes(
    matchData.format || "",
  );
  const getDisplayTeamName = (t: any) => {
    if (isSoloFormat && t.members && t.members.length > 0) {
      return getDisplayName(
        t.members[0].handle || t.members[0].name,
        t.members[0].pizza_count,
      );
    }
    return t.name;
  };

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600;700&family=Inter:wght@400&family=JetBrains+Mono:wght@500&display=swap"
        rel="stylesheet"
      />
      <div className={styles.page}>
        <main className={styles.main}>
        {/* Breadcrumb */}
        <BackLink href={backHref} label={backText} />

        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroTeams}>
            {matchData.teams.slice(0, 3).map((team, index) => {
              const isWinner =
                index === 0 &&
                matchData.teams.length > 0 &&
                (matchData.teams.length === 1 ||
                  team.score > matchData.teams[1].score);
              return (
                <div key={team.id} className={styles.teamBlock}>
                  {index > 0 && <span className={styles.vsDash}>-</span>}
                  <div
                    className={`${styles.teamResult} ${
                      isWinner ? styles.winner : styles.loser
                    }`}
                  >
                    {isWinner && (
                      <div className={styles.winnerBadge}>
                        <span
                          className={`material-symbols-outlined ${styles.icon16} ${styles.iconFilled}`}
                        >
                          workspace_premium
                        </span>
                        WINNER
                      </div>
                    )}
                    <h2
                      className={`${styles.teamName} ${
                        isWinner ? styles.teamNameWinner : ""
                      }`}
                    >
                      {getDisplayTeamName(team)}
                    </h2>
                    <span
                      className={`${styles.teamScore} ${
                        isWinner ? styles.teamScoreWinner : ""
                      }`}
                    >
                      {team.score}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className={styles.heroMeta}>
            {matchData.roomType} • <strong>{matchData.duration}</strong>
          </p>
        </section>

        {/* Termination Reason Banner */}
        {matchData.terminationReason === "disconnect" && (
          <div className={styles.terminationBanner}>
            <span className="material-symbols-outlined">person_off</span>
            <span>Match concluded early: A user disconnected</span>
          </div>
        )}

        {/* Advancement Banner */}
        {matchData.isKnockout && (
          <div className={styles.advancementBanner}>
            <span
              className={`material-symbols-outlined ${styles.advancementIcon} ${styles.iconFilled}`}
            >
              military_tech
            </span>
            <h3>✨ MATCH COMPLETED</h3>
          </div>
        )}

        {/* Grid Layout for MVP and Problems */}
        <div className={styles.grid}>
          {/* MVP & Team Standings Section */}
          <section className={styles.standingsCol}>
            <h4 className={styles.sectionHeading}>Standings & MVP</h4>

            {/* MVP Card */}
            {matchData.mvp ? (
              <div className={styles.mvpCard}>
                <div className={styles.mvpBadge}>
                  <span
                    className={`material-symbols-outlined ${styles.iconFilled}`}
                  >
                    star
                  </span>
                </div>
                <div className={styles.mvpInfo}>
                  <img
                    alt={matchData.mvp.name}
                    className={styles.mvpAvatar}
                    src={matchData.mvp.avatar}
                  />
                  <div>
                    <div className={styles.mvpLabel}>
                      <span
                        className={`material-symbols-outlined ${styles.icon14}`}
                      >
                        emoji_events
                      </span>{" "}
                      Match MVP
                    </div>
                    <h5 className={styles.mvpName}>
                      {getDisplayName(
                        matchData.mvp.name,
                        matchData.mvp.pizza_count,
                      )}
                    </h5>
                    {!isSoloFormat && (
                      <span className={styles.mvpTeam}>
                        {matchData.mvp.teamName}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.mvpContribRow}>
                  <span className={styles.mvpContribLabel}>
                    Total Contribution
                  </span>
                  <span className={styles.mvpContribValue}>
                    +{matchData.mvp.contribution} pts
                  </span>
                </div>
              </div>
            ) : (
              <div className={styles.mvpEmpty}>
                <div className={styles.mvpEmptyInner}>
                  <span
                    className={`material-symbols-outlined ${styles.mvpEmptyIcon}`}
                  >
                    person_off
                  </span>
                  <span>No solves this match</span>
                </div>
              </div>
            )}

            {/* Team Standings */}
            <div className={styles.standingsList}>
              {matchData.teams.map((team, tIdx) => (
                <div key={team.id} className={styles.teamStanding}>
                  <div className={styles.teamStandingHeader}>
                    <div className={styles.teamStandingLeft}>
                      <span className={styles.teamRank}>#{tIdx + 1}</span>
                      {isSoloFormat && team.members[0] && (
                        <img
                          src={team.members[0].avatar}
                          alt={team.members[0].handle}
                          className={styles.teamStandingAvatar}
                        />
                      )}
                      <span className={styles.teamStandingName}>
                        {getDisplayTeamName(team)}
                      </span>
                    </div>
                    <span className={styles.teamStandingScore}>
                      {team.score} pts
                    </span>
                  </div>
                  {!isSoloFormat && (
                    <div>
                      {team.members.map((member) => (
                        <div key={member.id} className={styles.memberRow}>
                          <div className={styles.memberInfo}>
                            <img
                              src={member.avatar}
                              alt={member.handle}
                              className={styles.memberAvatar}
                            />
                            <span className={styles.memberName}>
                              {member.handle}
                            </span>
                          </div>
                          <span className={styles.memberContrib}>
                            +{member.contribution || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Problem Matrix Section */}
          <section className={styles.problemsCol}>
            <h4 className={styles.sectionHeading}>Problem Matrix</h4>
            <div className={styles.problemGrid}>
              {matchData.problems.length > 0 ? (
                matchData.problems.map((prob) => {
                  let isUserTeam = false;
                  if (prob.solved && currentUserTeam) {
                    isUserTeam = prob.solver?.teamId === currentUserTeam.id;
                  }

                  return (
                    <a
                      key={prob.id}
                      href={getProblemUrl(prob.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${styles.problemCard} ${
                        prob.solved ? "" : styles.problemUnsolved
                      }`}
                    >
                      <div className={styles.problemMain}>
                        <div className={styles.problemLeft}>
                          <div
                            className={`${styles.problemBar} ${
                              prob.solved && isUserTeam
                                ? styles.problemBarSolved
                                : ""
                            }`}
                          ></div>
                          <div className={styles.problemInfo}>
                            <span
                              className={`${styles.problemName} ${
                                !prob.solved ? styles.problemNameUnsolved : ""
                              }`}
                            >
                              {prob.name?.startsWith(prob.id)
                                ? prob.name
                                : `${prob.id} - ${prob.name}`}
                            </span>
                            <div
                              className={`${styles.problemStatus} ${
                                prob.solved && isUserTeam
                                  ? styles.problemStatusSolved
                                  : ""
                              }`}
                            >
                              <span
                                className={`material-symbols-outlined ${styles.icon14}`}
                              >
                                {prob.solved
                                  ? isUserTeam
                                    ? "check_circle"
                                    : "lock"
                                  : "lock"}
                              </span>
                              {prob.solved
                                ? `Solved by ${isSoloFormat ? getDisplayName(prob.solver?.userName ?? "", prob.solver?.pizza_count) : prob.solver?.teamName}`
                                : "Unsolved"}
                            </div>
                          </div>
                        </div>

                        <div className={styles.problemStats}>
                          <div className={styles.statCol}>
                            <span className={styles.statLabel}>Rating</span>
                            <span
                              className={`${styles.statValue} ${
                                prob.solved && isUserTeam
                                  ? styles.statValueSolved
                                  : ""
                              }`}
                            >
                              {prob.rating || "--"}
                            </span>
                          </div>

                          <div
                            className={`${styles.statCol} ${styles.solverCol}`}
                          >
                            <span className={styles.statLabel}>Solver</span>
                            {prob.solved && prob.solver ? (
                              <div className={styles.solverInfo}>
                                <span
                                  className={styles.solverName}
                                  title={getDisplayName(
                                    prob.solver.userName,
                                    prob.solver.pizza_count,
                                  )}
                                >
                                  {getDisplayName(
                                    prob.solver.userName,
                                    prob.solver.pizza_count,
                                  )}
                                </span>
                                <img
                                  alt={prob.solver.userName}
                                  className={`${styles.solverAvatar} ${
                                    isUserTeam ? "" : styles.solverAvatarOther
                                  }`}
                                  src={prob.solver.userAvatar}
                                />
                              </div>
                            ) : (
                              <span className={styles.statMuted}>--</span>
                            )}
                          </div>

                          <div
                            className={`${styles.statCol} ${styles.timeCol}`}
                          >
                            <span className={styles.statLabel}>Time</span>
                            <span className={styles.statMuted}>
                              {prob.solved && prob.solver
                                ? `${Math.floor(prob.solver.solveMs / 60000)}m ${Math.floor((prob.solver.solveMs % 60000) / 1000)}s`
                                : "--"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </a>
                  );
                })
              ) : (
                <div className={styles.problemEmpty}>
                  No problems recorded for this match.
                </div>
              )}
            </div>
          </section>
        </div>
        </main>
      </div>
    </>
  );
}
