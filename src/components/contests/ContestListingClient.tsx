"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CircleCheck,
  Clock,
  History,
  ListFilter,
  Medal,
  Plus,
  Timer,
  TimerOff,
  Users,
  Eye,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  type ContestListingItem,
  getMyContestInvites,
  getMyTeamJoinRequests,
  respondToContestTeamRequest,
} from "@/lib/actions/contests";
import { CONTEST_TIMING } from "@/lib/constants";
import { formatDayTime, formatShortDate } from "@/lib/shared/dates";
import type { ContestRegistrationTiming } from "@/lib/contests/registrationTiming";

import type { ContestCreationPreset } from "@/components/contests/contestCreationForm";
import Button from "@/components/shared/Button";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/shared/Toast";
import SegmentedControl from "@/components/shared/SegmentedControl";

import { formatRemainingTime } from "./roomPresentation";
import CreateRoomModal from "./CreateRoomModal";
import RegisterContestModal from "./RegisterContestModal";
import ManageTeamModal from "./ManageTeamModal";
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

type FormatFilter = "all" | "blitz" | "arena" | "bracket";

export default function ContestListingClient({
  active: initialActive,
  upcoming: initialUpcoming,
  completed: initialCompleted,
  isHead = false,
  presets = [],
  registrationTiming,
}: {
  active: ContestListingItem[];
  upcoming: ContestListingItem[];
  completed: ContestListingItem[];
  isHead?: boolean;
  presets?: ContestCreationPreset[];
  registrationTiming: ContestRegistrationTiming;
}) {
  const router = useRouter();
  const toast = useToast();
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [registerModalData, setRegisterModalData] = useState<{
    isOpen: boolean;
    contestId: string;
    teamSize: number;
    viewOnly: boolean;
  }>({ isOpen: false, contestId: "", teamSize: 1, viewOnly: false });
  const [manageTeamData, setManageTeamData] = useState<{
    isOpen: boolean;
    contestId: string;
    teamId: string;
    teamName: string;
    isLeader: boolean;
  }>({
    isOpen: false,
    contestId: "",
    teamId: "",
    teamName: "",
    isLeader: false,
  });
  const [myInvites, setMyInvites] = useState<
    Extract<
      Awaited<ReturnType<typeof getMyContestInvites>>,
      { ok: true }
    >["data"]
  >([]);
  const [myJoinRequests, setMyJoinRequests] = useState<
    Extract<
      Awaited<ReturnType<typeof getMyTeamJoinRequests>>,
      { ok: true }
    >["data"]
  >([]);
  const [inviteActionLoading, setInviteActionLoading] = useState<string | null>(
    null,
  );

  useEffect(() => {
    getMyContestInvites().then((res) => {
      if (res.ok) setMyInvites(res.data);
    });
    getMyTeamJoinRequests().then((res) => {
      if (res.ok) setMyJoinRequests(res.data);
    });
  }, []);

  const handleRequestRespond = async (
    requestId: string,
    action: "accept" | "reject",
  ) => {
    setInviteActionLoading(requestId);

    try {
      const res = await respondToContestTeamRequest(requestId, action);
      if (res.ok) {
        setMyInvites((prev) =>
          prev.filter((request) => request._id !== requestId),
        );
        setMyJoinRequests((prev) =>
          prev.filter((request) => request._id !== requestId),
        );
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Unable to respond to the team request");
    } finally {
      setInviteActionLoading(null);
    }
  };

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

  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(
      () => setNow(Date.now()),
      CONTEST_TIMING.displayRefreshMs,
    );
    return () => clearInterval(timer);
  }, []);

  // Refresh from the server once scheduled contests are due to start
  useEffect(() => {
    if (initialUpcoming.length === 0) return;

    const timer = setInterval(() => {
      if (
        initialUpcoming.some(
          (contest) =>
            contest.startTime &&
            new Date(contest.startTime).getTime() <= Date.now(),
        )
      ) {
        router.refresh();
      }
    }, CONTEST_TIMING.listingRefreshMs);

    return () => clearInterval(timer);
  }, [initialUpcoming, router]);

  const isPastDeadline = (deadline?: Date | string | null) =>
    now !== null && Boolean(deadline) && now > new Date(deadline!).getTime();

  const filterByFormat = (contest: ContestListingItem) => {
    if (formatFilter === "all") return true;

    if (formatFilter === "bracket") return contest.format === "bracket";

    return contest.mode === formatFilter && contest.format !== "bracket";
  };

  const active = initialActive.filter(filterByFormat);
  const upcoming = initialUpcoming.filter(filterByFormat);
  const completed = initialCompleted.filter(filterByFormat);

  const getFormatDisplay = (contest: ContestListingItem) => {
    switch (contest.format) {
      case "1v1":
        return "1v1 Match";
      case "solo-tournament":
        return "Solo Tournament";
      case "team-tournament":
        return "Team Tournament";
      case "bracket":
        return contest.bracketSettings?.type === "double_elimination"
          ? "Double Elim Bracket"
          : "Knockout Bracket";
      default:
        return contest.format ? contest.format.replace("-", " ") : "Standard";
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
          registrationTiming={registrationTiming}
        />
      )}
      <main className={styles.main}>
        <div className={styles.container}>
          {/* Header & Filters */}
          <div className={styles.headerRow}>
            <div>
              <h1 className={styles.title}>Contests</h1>
              <p className={styles.lead}>
                Join a live room or start your own across Blitz, Arena and
                knockout brackets.
              </p>
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

          {[
            {
              title: "Pending Team Invites",
              requests: myInvites,
              invite: true,
            },
            {
              title: "Team Join Requests",
              requests: myJoinRequests,
              invite: false,
            },
          ].map(
            ({ title, requests, invite }) =>
              requests.length > 0 && (
                <section className={styles.section} key={title}>
                  <div className={styles.sectionHead}>
                    <Users size={20} />
                    <h2 className={styles.sectionTitle}>{title}</h2>
                  </div>
                  <div className={styles.cardGrid}>
                    {requests.map((request) => (
                      <div key={request._id} className={styles.contestCard}>
                        <div className={styles.cardTop}>
                          <div className={styles.cardTopInfo}>
                            <span className={styles.cardBadge}>
                              {invite ? "Invite" : "Request"}
                            </span>
                            <h3 className={styles.cardTitle}>
                              {request.teamName}
                            </h3>
                            <p className={styles.cardDesc}>
                              Contest: {request.contestName}
                            </p>
                            <p className={styles.cardDesc}>
                              {"invitedByHandle" in request ? (
                                <>
                                  Invited by{" "}
                                  <strong>{request.invitedByHandle}</strong>
                                </>
                              ) : (
                                <>
                                  <strong>{request.fromUserHandle}</strong>{" "}
                                  wants to join
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className={styles.requestActions}>
                          <Button
                            variant="primary"
                            size="small"
                            onClick={() =>
                              handleRequestRespond(request._id, "accept")
                            }
                            disabled={inviteActionLoading !== null}
                          >
                            {invite ? "Accept" : "Approve"}
                          </Button>
                          <Button
                            variant="danger"
                            size="small"
                            onClick={() =>
                              handleRequestRespond(request._id, "reject")
                            }
                            disabled={inviteActionLoading !== null}
                          >
                            {invite ? "Decline" : "Deny"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ),
          )}

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
                          {contest.mode} Mode • {getFormatDisplay(contest)}
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
                              now={now}
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
                    </div>
                    <div className={styles.cardFooter}>
                      {contest.isRegistered ? (
                        <>
                          <div className={styles.registeredLabel}>
                            <CircleCheck className={styles.icon18} size={18} />
                            Registered
                          </div>
                          <Link
                            href={`/internal/contests/${contest._id}`}
                            className={styles.joinBtn}
                          >
                            Join room
                          </Link>
                        </>
                      ) : contest.canSpectate ? (
                        <>
                          <div className={styles.notRegistered}>
                            Not registered
                          </div>
                          <Link
                            href={`/internal/contests/${contest._id}`}
                            className={styles.joinBtn}
                          >
                            <Eye className={styles.icon18} size={18} /> Spectate
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
                        {contest.mode} Mode • {getFormatDisplay(contest)}
                      </span>
                      <span className={styles.cardDateBadge}>
                        {contest.startTime
                          ? formatDayTime(contest.startTime)
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
                          {now !== null &&
                            contest.registrationStartTime &&
                            new Date(contest.registrationStartTime).getTime() >
                              now && (
                              <span className={styles.regStart}>
                                <CalendarDays
                                  className={styles.icon14}
                                  size={14}
                                />
                                <span>
                                  Registration Starts:{" "}
                                  {formatDayTime(contest.registrationStartTime)}
                                </span>
                              </span>
                            )}
                          {contest.registrationDeadline ? (
                            <span className={styles.regClose}>
                              <Timer className={styles.icon14} size={14} />
                              <span>
                                Closes:{" "}
                                {formatDayTime(contest.registrationDeadline)}
                              </span>
                            </span>
                          ) : (
                            <span className={styles.regNoDeadline}>
                              <TimerOff className={styles.icon14} size={14} />
                              <span>Deadline not specified</span>
                            </span>
                          )}
                          <UpcomingCountdownTimer
                            now={now}
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

                            {contest.teamSize &&
                              contest.teamSize > 1 &&
                              contest.isTeamLeader &&
                              contest.registeredTeamId && (
                                <button
                                  className={`${styles.miniBtn} ${styles.miniBtnPrimary}`}

                                  onClick={() => {
                                    setManageTeamData({
                                      isOpen: true,
                                      contestId: contest._id,
                                      teamId: contest.registeredTeamId!,
                                      teamName: contest.registeredTeamName!,
                                      isLeader: true,
                                    });
                                  }}
                                >
                                  Manage Team
                                </button>
                              )}

                            <button
                              onClick={() =>
                                handleRegisterClick(
                                  contest._id,
                                  contest.teamSize || 1,
                                  true,
                                )
                              }
                              className={`${styles.miniBtn} ${styles.miniBtnGhost}`}
                            >
                              View/Leave
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
                                now !== null &&
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
                <Link
                  href="/internal/contests/history"
                  className={styles.pillBtn}
                >
                  <History className={styles.icon18} size={18} />
                  View History
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
                        <tr key={contest._id} className={styles.tableRow}>
                          <td>
                            <Link
                              href={`/internal/contests/${contest._id}?from=listing`}
                              className={styles.tableName}
                            >
                              {contest.name}
                            </Link>
                          </td>
                          <td>
                            {contest.startTime
                              ? formatShortDate(contest.startTime)
                              : "-"}
                          </td>
                          <td>
                            <span className={styles.tableBadge}>
                              {getFormatDisplay(contest)}
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
              <EmptyState
                title="No contests found"
                hint="There are no contests matching your selected format."
              />
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

        <ManageTeamModal
          isOpen={manageTeamData.isOpen}
          onClose={() =>
            setManageTeamData({ ...manageTeamData, isOpen: false })
          }
          contestId={manageTeamData.contestId}
          teamId={manageTeamData.teamId}
          teamName={manageTeamData.teamName}
          isLeader={manageTeamData.isLeader}
        />
      </main>
    </div>
  );
}

function CountdownTimer({
  startTime,
  durationSeconds,
  now,
}: {
  startTime: Date | string | null;
  durationSeconds: number | null;
  now: number | null;
}) {
  const seconds =
    startTime && durationSeconds && now !== null
      ? (new Date(startTime).getTime() + durationSeconds * 1000 - now) / 1000
      : null;

  return (
    <div className={styles.timer}>
      {seconds === null ? "--:--:--" : formatRemainingTime(seconds, true)}
    </div>
  );
}

function UpcomingCountdownTimer({
  startTime,
  now,
}: {
  startTime: Date | string | null;
  now: number | null;
}) {
  if (!startTime || now === null) return null;
  const seconds = Math.max(
    0,
    Math.ceil((new Date(startTime).getTime() - now) / 1000),
  );

  return (
    <span className={styles.startsBadge}>
      <Clock size={12} />{" "}
      {seconds === 0
        ? "Starts soon"
        : `Starts in ${formatRemainingTime(seconds, true)}`}
    </span>
  );
}
