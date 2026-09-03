"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarX,
  CircleCheck,
  Clock,
  History,
  ListFilter,
  Medal,
  Plus,
  Timer,
  TimerOff,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { type ContestListingItem } from "@/lib/actions/contests";

import type { ContestCreationPreset } from "@/components/contests/contestCreationForm";
import SegmentedControl from "@/components/shared/SegmentedControl";

import CreateRoomModal from "./CreateRoomModal";
import RegisterContestModal from "./RegisterContestModal";
import styles from "./ContestListingClient.module.scss";

function RegisterButton({
  contestId,
  teamSize,
  onRegisterClick,
  disabledOverride = false,
  label,
}: {
  contestId: string;
  teamSize: number;
  onRegisterClick: (id: string, size: number) => void;
  disabledOverride?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={() => onRegisterClick(contestId, teamSize)}
      disabled={disabledOverride}
      className={`${styles.miniBtn} ${
        disabledOverride ? styles.miniBtnDisabled : styles.miniBtnPrimary
      }`}
    >
      {label || (disabledOverride ? "Closed" : "Register")}
    </button>
  );
}

function CountdownTimer({
  startTime,
  durationSeconds,
}: {
  startTime: Date | null;
  durationSeconds: number | null;
}) {
  const [timeLeft, setTimeLeft] = useState("--:--:--");

  useEffect(() => {
    if (!startTime || !durationSeconds) {
      setTimeLeft("--:--:--");
      return;
    }

    const endTime = new Date(startTime).getTime() + durationSeconds * 1000;

    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeLeft("00:00:00");
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`,
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime, durationSeconds]);

  return <div className={styles.timer}>{timeLeft}</div>;
}

type FormatFilter = "all" | "blitz" | "arena" | "bracket";

export default function ContestListingClient({
  active: initialActive,
  upcoming: initialUpcoming,
  completed: initialCompleted,
  isHead = false,
  presets = [],
  deadlineMinutes = 1,
}: {
  active: ContestListingItem[];
  upcoming: ContestListingItem[];
  completed: ContestListingItem[];
  isHead?: boolean;
  presets?: ContestCreationPreset[];
  deadlineMinutes?: number;
}) {
  const router = useRouter();
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [registerModalData, setRegisterModalData] = useState<{
    isOpen: boolean;
    contestId: string;
    teamSize: number;
    viewOnly: boolean;
  }>({ isOpen: false, contestId: "", teamSize: 1, viewOnly: false });
  const handleRegisterClick = (
    id: string,
    size: number,
    viewOnly: boolean = false,
  ) =>
    setRegisterModalData({
      isOpen: true,
      contestId: id,
      teamSize: size,
      viewOnly,
    });

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const isPastDeadline = (deadline?: Date | string | null) => {
    if (!isMounted || !deadline) return false;
    return now > new Date(deadline).getTime();
  };

  const [localActive, setLocalActive] =
    useState<ContestListingItem[]>(initialActive);
  const [localUpcoming, setLocalUpcoming] =
    useState<ContestListingItem[]>(initialUpcoming);

  useEffect(() => {
    setLocalActive(initialActive);
    setLocalUpcoming(initialUpcoming);
  }, [initialActive, initialUpcoming]);

  useEffect(() => {
    if (localUpcoming.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();

      setLocalUpcoming((prevUpcoming) => {
        const transferring = prevUpcoming.filter((c) => {
          const transitionTime = c.startTime;
          return transitionTime && new Date(transitionTime).getTime() <= now;
        });
        if (transferring.length > 0) {
          // Safe to call another state setter here because we are in an effect callback,
          // BUT React 18 strict mode might execute updaters twice.
          // To be safe, we schedule it out of the pure function using setTimeout
          setTimeout(() => {
            setLocalActive((prevActive) => {
              const newActive: ContestListingItem[] = [...transferring].map(
                (c) => ({
                  ...c,
                  status: "active",
                  roomStatus: "waiting",
                }),
              );
              for (const item of prevActive) {
                if (!newActive.some((x) => x._id === item._id)) {
                  newActive.push(item);
                }
              }
              return newActive;
            });
          }, 0);

          return prevUpcoming.filter(
            (c) => !transferring.some((t) => t._id === c._id),
          );
        }
        return prevUpcoming;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [localUpcoming.length]);

  const filterByFormat = (contest: ContestListingItem) => {
    if (formatFilter === "all") return true;
    if (formatFilter === "bracket") return contest.format === "bracket";
    return contest.mode === formatFilter && contest.format !== "bracket";
  };

  const active = localActive.filter(filterByFormat);
  const upcoming = localUpcoming.filter(filterByFormat);
  const completed = initialCompleted.filter(filterByFormat);

  const getFormatDisplay = (format?: string) => {
    switch (format) {
      case "1v1":
        return "1v1 Match";
      case "solo-tournament":
        return "Solo Tournament";
      case "team-tournament":
        return "Team Tournament";
      case "bracket":
        return "Knockout Bracket";
      default:
        return format ? format.replace("-", " ") : "Standard";
    }
  };

  return (
    <div className={styles.page}>
      {showCreateModal && (
        <CreateRoomModal
          isOpen={true}
          onClose={() => setShowCreateModal(false)}
          isHead={isHead}
          presets={presets}
          deadlineMinutes={deadlineMinutes}
        />
      )}
      <main className={styles.main}>
        <div className={styles.container}>
          {/* Header & Filters */}
          <div className={styles.headerRow}>
            <div>
              <p className={styles.kicker}>Internal</p>
              <h1 className={styles.title}>Contests</h1>
            </div>
            <div className={styles.headerControls}>
              <SegmentedControl
                label="Contest format"
                segments={[
                  {
                    label: "All formats",
                    active: formatFilter === "all",
                    onClick: () => setFormatFilter("all"),
                    Icon: ListFilter,
                  },
                  {
                    label: "Blitz",
                    active: formatFilter === "blitz",
                    onClick: () => setFormatFilter("blitz"),
                  },
                  {
                    label: "Arena",
                    active: formatFilter === "arena",
                    onClick: () => setFormatFilter("arena"),
                  },
                  {
                    label: "Knockout",
                    active: formatFilter === "bracket",
                    onClick: () => setFormatFilter("bracket"),
                  },
                ]}
              />
              <button
                onClick={() => setShowCreateModal(true)}
                className={styles.createBtn}
              >
                <Plus className={styles.icon16} size={16} />
                Create a room
              </button>
            </div>
          </div>

          {/* Active Contests */}
          {active.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <div className={styles.liveDot}></div>
                <h2 className={styles.sectionTitle}>Active Now</h2>
              </div>
              <div className={styles.cardGrid}>
                {active.map((contest) => (
                  <div
                    key={contest._id}
                    className={`${styles.contestCard} ${styles.activeCard}`}
                  >
                    <div className={styles.cardGlowCorner}></div>
                    <div className={styles.cardTop}>
                      <div className={styles.cardTopInfo}>
                        <span className={styles.cardBadge}>
                          {contest.mode} Mode •{" "}
                          {getFormatDisplay(contest.format)}
                        </span>
                        <h3 className={styles.cardTitle}>{contest.name}</h3>
                        <p className={styles.cardDesc}>
                          {contest.description ||
                            "Competitive programming match"}
                        </p>
                      </div>
                      <div className={styles.cardTimerCol}>
                        {contest.isRegistered &&
                        contest.roomStatus === "waiting" ? (
                          <>
                            <div className={styles.timerWaiting}>
                              Waiting...
                            </div>
                            <div className={styles.timerSub}>
                              For players to ready up
                            </div>
                          </>
                        ) : (
                          <>
                            <CountdownTimer
                              startTime={
                                contest.actualStartTime || contest.startTime
                              }
                              durationSeconds={contest.durationSeconds}
                            />
                            <div className={styles.timerSub}>Remaining</div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={styles.cardMeta}>
                      <div className={styles.cardMetaItem}>
                        <Users className={styles.icon16} size={16} />{" "}
                        {contest.participantsCount || 0} Registered
                      </div>
                      <div className={styles.cardMetaItem}>
                        <Medal className={styles.icon16} size={16} /> 5000 Pts
                        Pool
                      </div>
                    </div>
                    <div className={styles.cardFooter}>
                      {contest.isRegistered ? (
                        <>
                          <div className={styles.registeredLabel}>
                            <CircleCheck className={styles.icon18} size={18} />
                            Registered
                          </div>
                          <Link href={`/internal/contests/${contest._id}`}>
                            <button className={styles.joinBtn}>
                              Join room
                            </button>
                          </Link>
                        </>
                      ) : (
                        <>
                          <div className={styles.notRegistered}>
                            Not registered
                          </div>
                          <div className={styles.inProgressBadge}>
                            <Clock className={styles.icon16} size={16} />
                            In Progress
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Upcoming Contests */}
          {upcoming.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeadBordered}>
                <h2 className={styles.sectionTitle}>Upcoming</h2>
              </div>
              <div className={styles.cardGrid2}>
                {upcoming.map((contest) => (
                  <div
                    key={contest._id}
                    className={`${styles.contestCard} ${styles.upcomingCard}`}
                  >
                    <div className={styles.cardTagRow}>
                      <span className={styles.cardBadgeNeutral}>
                        {contest.mode} Mode • {getFormatDisplay(contest.format)}
                      </span>
                      <span className={styles.cardDateBadge}>
                        {contest.startTime
                          ? new Intl.DateTimeFormat("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            }).format(new Date(contest.startTime))
                          : "TBD"}
                      </span>
                    </div>
                    <h3 className={styles.upcomingTitle}>{contest.name}</h3>
                    <p className={styles.upcomingDesc}>
                      {contest.description ||
                        "A competitive programming match focusing on algorithms and data structures."}
                    </p>
                    <div className={styles.upcomingFooter}>
                      <div className={styles.upcomingInfo}>
                        <span className={styles.regMeta}>
                          <Users className={styles.icon16} size={16} />
                          <span>
                            {contest.participantsCount || 0} Registered
                          </span>
                        </span>
                        <div className={styles.regInfoCol}>
                          {contest.registrationStartTime &&
                            new Date(contest.registrationStartTime).getTime() >
                              now && (
                              <span className={styles.regStart}>
                                <CalendarDays
                                  className={styles.icon14}
                                  size={14}
                                />
                                <span>
                                  Registration Starts:{" "}
                                  {new Intl.DateTimeFormat("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: true,
                                  }).format(
                                    new Date(contest.registrationStartTime),
                                  )}
                                </span>
                              </span>
                            )}
                          {contest.registrationDeadline ? (
                            <span className={styles.regClose}>
                              <Timer className={styles.icon14} size={14} />
                              <span>
                                Closes:{" "}
                                {new Intl.DateTimeFormat("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                }).format(
                                  new Date(contest.registrationDeadline),
                                )}
                              </span>
                            </span>
                          ) : (
                            <span className={styles.regNoDeadline}>
                              <TimerOff className={styles.icon14} size={14} />
                              <span>Deadline not specified</span>
                            </span>
                          )}
                          <UpcomingCountdownTimer
                            startTime={contest.startTime || null}
                          />
                        </div>
                      </div>

                      {contest.isRegistered ? (
                        isPastDeadline(contest.registrationDeadline) ||
                        contest.status === "provisioning" ? (
                          <div className={styles.regActions}>
                            <div className={styles.registeredMini}>
                              <CircleCheck
                                className={styles.icon16}
                                size={16}
                              />
                              <span className={styles.hiddenSm}>
                                Registered
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                handleRegisterClick(
                                  contest._id,
                                  contest.teamSize || 1,
                                  true,
                                )
                              }
                              className={`${styles.miniBtn} ${styles.miniBtnMuted}`}
                            >
                              View Registrations
                            </button>
                          </div>
                        ) : (
                          <div className={styles.regActions}>
                            <div className={styles.registeredMini}>
                              <CircleCheck
                                className={styles.icon16}
                                size={16}
                              />
                              <span className={styles.hiddenSm}>
                                Registered
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                handleRegisterClick(
                                  contest._id,
                                  contest.teamSize || 1,
                                  true,
                                )
                              }
                              className={`${styles.miniBtn} ${styles.miniBtnPrimary}`}
                            >
                              View / Modify
                            </button>
                          </div>
                        )
                      ) : (
                        <div className={styles.regActions}>
                          {contest.status === "draft" &&
                          contest.registrationType !== "closed" ? (
                            <RegisterButton
                              contestId={contest._id}
                              teamSize={contest.teamSize || 1}
                              onRegisterClick={handleRegisterClick}
                              disabledOverride={true}
                              label={
                                contest.registrationStartTime &&
                                new Date(
                                  contest.registrationStartTime,
                                ).getTime() > now
                                  ? "When will the registration start?"
                                  : "Upcoming Registration"
                              }
                            />
                          ) : contest.registrationType === "closed" ? (
                            <button
                              onClick={() =>
                                handleRegisterClick(
                                  contest._id,
                                  contest.teamSize || 1,
                                  true,
                                )
                              }
                              className={`${styles.miniBtn} ${styles.miniBtnMuted}`}
                            >
                              View Registrations
                            </button>
                          ) : contest.registeredCount >=
                              contest.maxParticipants ||
                            isPastDeadline(contest.registrationDeadline) ||
                            contest.status === "provisioning" ? (
                            <button
                              onClick={() =>
                                handleRegisterClick(
                                  contest._id,
                                  contest.teamSize || 1,
                                  true,
                                )
                              }
                              className={`${styles.miniBtn} ${styles.miniBtnMuted}`}
                            >
                              View Registrations
                            </button>
                          ) : (
                            <RegisterButton
                              contestId={contest._id}
                              teamSize={contest.teamSize || 1}
                              onRegisterClick={handleRegisterClick}
                              disabledOverride={false}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Past Contests (List View) */}
          {completed.length > 0 && (
            <section>
              <div className={styles.sectionHeadBordered}>
                <h2 className={styles.sectionTitle}>Completed</h2>
                <Link href="/internal/contests/history">
                  <button className={styles.pillBtn}>
                    <History className={styles.icon18} size={18} />
                    View History
                  </button>
                </Link>
              </div>
              <div className={styles.completedCard}>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Contest Name</th>
                        <th>Date</th>
                        <th>Format</th>
                        <th>Participants</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completed.map((contest) => (
                        <tr
                          key={contest._id}
                          onClick={() =>
                            router.push(
                              `/internal/contests/${contest._id}?from=listing`,
                            )
                          }
                          className={styles.tableRow}
                          role="button"
                        >
                          <td>
                            <span className={styles.tableName}>
                              {contest.name}
                            </span>
                          </td>
                          <td>
                            {contest.startTime
                              ? new Intl.DateTimeFormat("en-US", {
                                  month: "short",
                                  day: "2-digit",
                                  year: "numeric",
                                }).format(new Date(contest.startTime))
                              : "-"}
                          </td>
                          <td>
                            <span className={styles.tableBadge}>
                              {getFormatDisplay(contest.format)}
                            </span>
                          </td>
                          <td>{contest.participantsCount || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* No Contests Found */}
          {active.length === 0 &&
            upcoming.length === 0 &&
            completed.length === 0 && (
              <div className={styles.empty}>
                <CalendarX className={styles.emptyIcon} size={64} />
                <h3 className={styles.emptyTitle}>No contests found</h3>
                <p className={styles.emptyText}>
                  There are no contests matching your selected format.
                </p>
              </div>
            )}
        </div>

        <RegisterContestModal
          isOpen={registerModalData.isOpen}
          onClose={() =>
            setRegisterModalData({ ...registerModalData, isOpen: false })
          }
          contestId={registerModalData.contestId}
          teamSize={registerModalData.teamSize}
          viewOnly={registerModalData.viewOnly}
        />
      </main>
    </div>
  );
}

function UpcomingCountdownTimer({
  startTime,
}: {
  startTime: Date | string | null;
}) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!startTime) {
      setTimeLeft(null);
      return;
    }

    const start = new Date(startTime).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = start - now;

      if (diff <= 0) {
        setTimeLeft("Starts soon");
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      if (d > 0) {
        setTimeLeft(`in ${d}d ${h}h ${m}m`);
      } else if (h > 0) {
        setTimeLeft(`in ${h}h ${m}m ${s}s`);
      } else {
        setTimeLeft(`in ${m}m ${s}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (!startTime || !timeLeft) return null;

  return (
    <span className={styles.startsBadge}>
      Starts <Clock className={styles.icon12} size={12} /> {timeLeft}
    </span>
  );
}
