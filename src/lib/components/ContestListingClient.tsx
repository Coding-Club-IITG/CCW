"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { type ContestListingItem } from "@/lib/actions/contests";
import Link from "next/link";

import CreateRoomModal from "./CreateRoomModal";
import RegisterContestModal from "./RegisterContestModal";


function RegisterButton({ contestId, teamSize, onRegisterClick, disabledOverride = false }: { contestId: string, teamSize: number, onRegisterClick: (id: string, size: number) => void, disabledOverride?: boolean }) {
  return (
    <button 
      onClick={() => onRegisterClick(contestId, teamSize)} 
      disabled={disabledOverride}
      className={`px-3 py-1.5 border rounded font-label-sm text-[13px] transition-all duration-200 flex items-center justify-center h-[32px] ${
        disabledOverride 
          ? "border-outline-variant text-outline-variant cursor-not-allowed bg-surface-variant/30 opacity-70" 
          : "border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:border-primary hover:text-on-primary hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-50"
      }`}
    >
      {disabledOverride ? "Closed" : "Register"}
    </button>
  );
}

function CountdownTimer({ startTime, durationSeconds }: { startTime: Date | null, durationSeconds: number | null }) {
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
        `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime, durationSeconds]);

  return <div className="text-on-surface font-label-sm font-medium text-lg tracking-wider">{timeLeft}</div>;
}

type FormatFilter = "all" | "blitz" | "arena" | "bracket";

export default function ContestListingClient({
  active: initialActive,
  upcoming: initialUpcoming,
  completed: initialCompleted,
}: {
  active: ContestListingItem[];
  upcoming: ContestListingItem[];
  completed: ContestListingItem[];
}) {
  const router = useRouter();
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [registerModalData, setRegisterModalData] = useState<{isOpen: boolean, contestId: string, teamSize: number, viewOnly: boolean}>({isOpen: false, contestId: "", teamSize: 1, viewOnly: false});
  const handleRegisterClick = (id: string, size: number, viewOnly: boolean = false) => setRegisterModalData({isOpen: true, contestId: id, teamSize: size, viewOnly});

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const isPastDeadline = (deadline?: Date | string | null) => {
    if (!isMounted || !deadline) return false;
    return new Date() > new Date(deadline);
  };

  const [localActive, setLocalActive] = useState<ContestListingItem[]>(initialActive);
  const [localUpcoming, setLocalUpcoming] = useState<ContestListingItem[]>(initialUpcoming);

  useEffect(() => {
    setLocalActive(initialActive);
    setLocalUpcoming(initialUpcoming);
  }, [initialActive, initialUpcoming]);

  useEffect(() => {
    if (localUpcoming.length === 0) return;
    
    const timer = setInterval(() => {
      const now = Date.now();
      
      setLocalUpcoming(prevUpcoming => {
        const transferring = prevUpcoming.filter(c => c.startTime && new Date(c.startTime).getTime() <= now);
        if (transferring.length > 0) {
          // Safe to call another state setter here because we are in an effect callback,
          // BUT React 18 strict mode might execute updaters twice. 
          // To be safe, we schedule it out of the pure function using setTimeout
          setTimeout(() => {
            setLocalActive(prevActive => {
              const newActive = [...transferring];
              for (const item of prevActive) {
                if (!newActive.some(x => x._id === item._id)) {
                  newActive.push(item);
                }
              }
              return newActive;
            });
          }, 0);
          
          return prevUpcoming.filter(c => !transferring.some(t => t._id === c._id));
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
    switch(format) {
      case "1v1": return "1v1 Match";
      case "solo-tournament": return "Solo Tournament";
      case "team-tournament": return "Team Tournament";
      case "bracket": return "Knockout Bracket";
      default: return format ? format.replace("-", " ") : "Standard";
    }
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      {/* Scoped styles specific to the Tailwind portion of the page */}
      <style>{`
        .stitch-container { font-family: 'Inter', sans-serif; }
        .stitch-container ::-webkit-scrollbar { width: 8px; }
        .stitch-container ::-webkit-scrollbar-track { background: #131313; }
        .stitch-container ::-webkit-scrollbar-thumb { background: #353534; border-radius: 4px; }
        .stitch-container ::-webkit-scrollbar-thumb:hover { background: #40493d; }
        .hover-sharp-shadow:hover { box-shadow: 0px 0px 12px 1px rgba(136, 217, 130, 0.6) !important; }
      `}</style>

      <div className="flex flex-col flex-1 overflow-hidden dark stitch-container w-full h-full min-h-[calc(100vh-64px)] bg-background relative">
        {showCreateModal && (
          <CreateRoomModal isOpen={true} onClose={() => setShowCreateModal(false)} />
        )}
        <main className="flex-1 overflow-y-auto p-margin-mobile md:p-margin-desktop w-full">
          <div className="max-w-container-max-width mx-auto">
            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start mb-10 gap-6">
              <div className="flex items-center gap-4">
                <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface mb-2 mt-1">Contests</h1>
              </div>
              <div className="flex flex-col items-start md:items-end gap-4 w-full md:w-auto">
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={() => setFormatFilter("all")}
                    className={formatFilter === "all" ? "px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface rounded-full font-label-sm text-label-sm hover:border-primary transition-colors flex items-center gap-2" : "px-4 py-2 bg-surface border border-outline-variant text-on-surface-variant rounded-full font-label-sm text-label-sm hover:border-primary hover:text-on-surface transition-colors"}
                  >
                    {formatFilter === "all" && <span className="material-symbols-outlined text-[18px]">filter_list</span>}
                    All Formats
                  </button>
                  <button 
                    onClick={() => setFormatFilter("blitz")}
                    className={formatFilter === "blitz" ? "px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface rounded-full font-label-sm text-label-sm hover:border-primary transition-colors flex items-center gap-2" : "px-4 py-2 bg-surface border border-outline-variant text-on-surface-variant rounded-full font-label-sm text-label-sm hover:border-primary hover:text-on-surface transition-colors"}
                  >
                    Blitz
                  </button>
                  <button 
                    onClick={() => setFormatFilter("arena")}
                    className={formatFilter === "arena" ? "px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface rounded-full font-label-sm text-label-sm hover:border-primary transition-colors flex items-center gap-2" : "px-4 py-2 bg-surface border border-outline-variant text-on-surface-variant rounded-full font-label-sm text-label-sm hover:border-primary hover:text-on-surface transition-colors"}
                  >
                    Arena
                  </button>
                  <button 
                    onClick={() => setFormatFilter("bracket")}
                    className={formatFilter === "bracket" ? "px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface rounded-full font-label-sm text-label-sm hover:border-primary transition-colors flex items-center gap-2" : "px-4 py-2 bg-surface border border-outline-variant text-on-surface-variant rounded-full font-label-sm text-label-sm hover:border-primary hover:text-on-surface transition-colors"}
                  >
                    Knockout
                  </button>
                </div>
                <button onClick={() => setShowCreateModal(true)} className="px-4 py-1.5 bg-transparent border border-dashed border-primary text-primary rounded font-label-sm text-[13px] hover:bg-primary/10 transition-all flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Create a room
                </button>
              </div>
            </div>

            {/* Active Contests */}
            {active.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse"></div>
                  <h2 className="text-2xl font-headline-lg font-semibold text-on-surface">Active Now</h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Active Contest Card */}
                  {active.map(contest => (
                    <div key={contest._id} className="hover-sharp-shadow bg-surface-container border border-primary/30 rounded-xl p-6 relative overflow-hidden group hover:border-primary hover:-translate-y-1 transition-all duration-300">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10 group-hover:bg-primary/10 transition-colors"></div>
                      <div className="flex justify-between items-start mb-4 gap-2">
                        <div className="min-w-0">
                          <span className="inline-block px-2 py-1 bg-primary/10 text-primary font-label-sm text-[12px] rounded mb-2 capitalize whitespace-nowrap">{contest.mode} Mode • {getFormatDisplay(contest.format)}</span>
                          <h3 className="text-xl font-bold text-on-surface mb-1 truncate">{contest.name}</h3>
                          <p className="text-on-surface-variant text-sm">{contest.description || "Competitive programming match"}</p>
                        </div>
                        <div className="text-right">
                          <CountdownTimer startTime={contest.startTime} durationSeconds={contest.durationSeconds} />
                          <div className="text-on-surface-variant text-xs">Remaining</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mb-6 text-sm text-on-surface-variant">
                        <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">group</span> {contest.participantsCount || 0} Registered</div>
                        <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">military_tech</span> 5000 Pts Pool</div>
                      </div>
                      <div className="flex items-center justify-between mt-auto">
                        {contest.isRegistered ? (
                          <>
                            <div className="flex items-center gap-2 text-primary font-medium text-sm font-label-sm">
                              <span className="material-symbols-outlined text-[18px]">check_circle</span>
                              Registered
                            </div>
                            <Link href={`/internal/contests/${contest._id}`}>
                              <button className="px-6 py-2 bg-primary-container text-on-primary-container rounded font-label-sm hover:brightness-110 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(30,70,32,0.5)] active:translate-y-0 transition-all duration-200">Join room</button>
                            </Link>
                          </>
                        ) : (
                          <>
                            <div className="text-on-surface-variant font-label-sm text-sm">Not registered</div>
                            <div className="px-4 py-2 border border-outline-variant/50 bg-surface-variant/30 text-on-surface-variant/80 rounded font-label-sm flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0">
                              <span className="material-symbols-outlined !text-[16px] leading-none opacity-80">pending</span>
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
              <section className="mb-12">
                <div className="flex justify-between items-center mb-6 border-b border-outline-variant pb-2">
                  <h2 className="text-2xl font-headline-lg font-semibold text-on-surface">Upcoming</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Upcoming Card */}
                  {upcoming.map(contest => (
                    <div key={contest._id} className="hover-sharp-shadow bg-surface-container border border-outline-variant rounded-xl p-6 relative overflow-hidden group hover:border-primary/50 hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
                      <div className="flex flex-wrap justify-between items-start mb-4 gap-2">
                        <span className="inline-block px-2 py-1 bg-surface-variant text-on-surface-variant font-label-sm text-[12px] rounded capitalize whitespace-nowrap">{contest.mode} Mode • {getFormatDisplay(contest.format)}</span>
                        <span className="text-xs font-label-sm text-on-surface-variant bg-surface px-2 py-1 rounded border border-outline-variant whitespace-nowrap">
                          {contest.startTime ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(contest.startTime)) : "TBD"}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-on-surface mb-2">{contest.name}</h3>
                      <p className="text-on-surface-variant text-sm mb-6 flex-grow">{contest.description || "A competitive programming match focusing on algorithms and data structures."}</p>
                      <div className="flex flex-wrap items-center justify-between mt-auto pt-4 border-t border-outline-variant/50 w-full gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm text-on-surface-variant flex items-center gap-1 whitespace-nowrap">
                            <span className="material-symbols-outlined text-[16px] shrink-0">group</span>
                            <span>{contest.participantsCount || 0} Registered</span>
                          </span>
                          {contest.registrationDeadline ? (
                            <span className="text-xs font-label-sm text-error/90 flex items-center gap-1 whitespace-nowrap">
                              <span className="material-symbols-outlined text-[14px] shrink-0">timer</span>
                              <span>Closes: {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(contest.registrationDeadline))}</span>
                            </span>
                          ) : (
                            <span className="text-xs font-label-sm text-on-surface-variant flex items-center gap-1 whitespace-nowrap">
                              <span className="material-symbols-outlined text-[14px] shrink-0">timer_off</span>
                              <span>Deadline not specified</span>
                            </span>
                          )}
                        </div>

                        {contest.isRegistered ? (
                          isPastDeadline(contest.registrationDeadline) ? (
                            <div className="flex items-center gap-2 ml-auto">
                              <div className="text-primary/70 font-medium text-sm font-label-sm flex items-center gap-1 shrink-0">
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                <span className="hidden sm:inline">Registered</span>
                              </div>
                              <button 
                                onClick={() => handleRegisterClick(contest._id, contest.teamSize || 1, true)} 
                                className="px-3 py-1.5 border border-outline-variant/50 bg-surface-variant/30 text-primary/70 hover:bg-surface-variant hover:text-primary rounded font-label-sm text-[13px] transition-all duration-200 whitespace-nowrap shrink-0 h-[32px]"
                              >
                                View Registrations
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 ml-auto">
                              <div className="text-primary font-medium text-sm font-label-sm flex items-center gap-1 shrink-0">
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                <span className="hidden sm:inline">Registered</span>
                              </div>
                              <button 
                                onClick={() => handleRegisterClick(contest._id, contest.teamSize || 1, true)} 
                                className="px-3 py-1.5 border border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-on-primary rounded font-label-sm text-[13px] transition-all duration-200 whitespace-nowrap shrink-0 h-[32px]"
                              >
                                View / Modify
                              </button>
                            </div>
                          )
                        ) : (
                          <div className="shrink-0 ml-auto">
                            {contest.registeredCount >= contest.maxParticipants ? (
                              <div className="px-3 py-1.5 border border-outline-variant/50 bg-surface-variant/30 text-on-surface-variant/70 rounded font-label-sm text-[13px] flex items-center justify-center gap-1 transition-all duration-200 whitespace-nowrap shrink-0 h-[32px]">
                                <span className="material-symbols-outlined !text-[14px] leading-none" style={{ fontSize: '14px' }}>block</span>
                                Full
                              </div>
                            ) : (
                              <RegisterButton 
                                contestId={contest._id} 
                                teamSize={contest.teamSize || 1}
                                onRegisterClick={handleRegisterClick}
                                disabledOverride={isPastDeadline(contest.registrationDeadline)} 
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
                <div className="flex justify-between items-center mb-6 border-b border-outline-variant pb-2">
                  <h2 className="text-2xl font-headline-lg font-semibold text-on-surface">Completed</h2>
                  <Link href="/internal/contests/history">
                    <button className="px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface rounded-full font-label-sm text-label-sm hover:border-primary transition-colors flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">history</span>
                      View History
                    </button>
                  </Link>
                </div>
                <div className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-container-high border-b border-outline-variant text-on-surface-variant font-label-sm text-sm">
                          <th className="p-4 font-medium">Contest Name</th>
                          <th className="p-4 font-medium">Date</th>
                          <th className="p-4 font-medium">Format</th>
                          <th className="p-4 font-medium">Participants</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {completed.map(contest => (
                          <tr key={contest._id} onClick={() => router.push(`/internal/contests/${contest._id}?from=listing`)} className="border-b border-outline-variant/50 hover:bg-surface-container-high hover:scale-[1.01] hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer group" role="button">
                            <td className="p-4 text-on-surface font-medium">
                              <span className="block w-full">{contest.name}</span>
                            </td>
                            <td className="p-4 text-on-surface-variant">
                              {contest.startTime ? new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(contest.startTime)) : "-"}
                            </td>
                            <td className="p-4"><span className="px-2 py-1 bg-surface-variant text-on-surface-variant rounded text-xs font-label-sm capitalize">{getFormatDisplay(contest.format)}</span></td>
                            <td className="p-4 text-on-surface-variant">{contest.participantsCount || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* No Contests Found */}
            {active.length === 0 && upcoming.length === 0 && completed.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <span className="material-symbols-outlined text-[64px] text-on-surface-variant/50 mb-4">event_busy</span>
                <h3 className="text-xl font-bold text-on-surface mb-2">No contests found</h3>
                <p className="text-on-surface-variant mb-6">There are no contests matching your selected format.</p>
              </div>
            )}
          </div>
          
          <RegisterContestModal isOpen={registerModalData.isOpen} onClose={() => setRegisterModalData({...registerModalData, isOpen: false})} contestId={registerModalData.contestId} teamSize={registerModalData.teamSize} viewOnly={registerModalData.viewOnly} />
        </main>
      </div>
    </>
  );
}
