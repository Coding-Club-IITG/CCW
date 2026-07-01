"use client";

import { useState } from "react";
import type { ContestListingItem } from "@/lib/actions/contests";
import Link from "next/link";
import "@/styles/stitch.css";

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
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");

  const filterByFormat = (contest: ContestListingItem) => {
    if (formatFilter === "all") return true;
    if (formatFilter === "bracket") return contest.format === "bracket";
    return contest.mode === formatFilter && contest.format !== "bracket";
  };

  const active = initialActive.filter(filterByFormat);
  const upcoming = initialUpcoming.filter(filterByFormat);
  const completed = initialCompleted.filter(filterByFormat);

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
      `}</style>

      <div className="flex flex-col flex-1 overflow-hidden dark stitch-container w-full h-full min-h-[calc(100vh-64px)] bg-background">
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-margin-mobile md:p-margin-desktop w-full">
          <div className="max-w-container-max-width mx-auto">
            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6">
              <div>
                <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface mb-2">Contests</h1>
              </div>
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
                    <div key={contest._id} className="bg-surface-container border border-primary/30 rounded-xl p-6 relative overflow-hidden group hover:border-primary transition-colors">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10 group-hover:bg-primary/10 transition-colors"></div>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="inline-block px-2 py-1 bg-primary/10 text-primary font-label-sm text-[12px] rounded mb-2 capitalize">{contest.format === "bracket" ? "Knockout" : contest.mode === "arena" ? "Arena" : contest.mode === "blitz" ? "Blitz" : contest.format} Format</span>
                          <h3 className="text-xl font-bold text-on-surface mb-1">{contest.name}</h3>
                          <p className="text-on-surface-variant text-sm">{contest.description || "Div 1 & Div 2 Rated"}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-on-surface font-label-sm font-medium text-lg tracking-wider">01:45:22</div>
                          <div className="text-on-surface-variant text-xs">Remaining</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mb-6 text-sm text-on-surface-variant">
                        <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">group</span> {contest.participantsCount || 0} Registered</div>
                        <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">military_tech</span> 5000 Pts Pool</div>
                      </div>
                      <div className="flex items-center justify-between mt-auto">
                        {contest.isRegistered ? (
                          <div className="flex items-center gap-2 text-primary font-medium text-sm font-label-sm">
                            <span className="material-symbols-outlined text-[18px]">check_circle</span>
                            Registered
                          </div>
                        ) : (
                          <div className="text-on-surface-variant font-label-sm text-sm">Not registered</div>
                        )}
                        <Link href={`/internal/contests/${contest._id}`}>
                          <button className="px-6 py-2 bg-primary-container text-on-primary-container rounded font-label-sm hover:brightness-110 transition-all shadow-[0_0_15px_rgba(46,125,50,0.3)]">Join room</button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming Contests */}
            {upcoming.length > 0 && (
              <section className="mb-12">
                <h2 className="text-2xl font-headline-lg font-semibold text-on-surface mb-6 border-b border-outline-variant pb-2">Upcoming</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Upcoming Card */}
                  {upcoming.map(contest => (
                    <div key={contest._id} className="bg-surface-container border border-outline-variant rounded-xl p-6 hover:border-outline transition-colors flex flex-col h-full">
                      <div className="flex justify-between items-start mb-4">
                        <span className="inline-block px-2 py-1 bg-surface-variant text-on-surface-variant font-label-sm text-[12px] rounded capitalize">{contest.format === "bracket" ? "Knockout" : contest.mode === "arena" ? "Arena" : contest.mode === "blitz" ? "Blitz" : contest.format} Format</span>
                        <span className="text-xs font-label-sm text-on-surface-variant bg-surface px-2 py-1 rounded border border-outline-variant">
                          {contest.startTime ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(contest.startTime)) : "TBD"}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-on-surface mb-2">{contest.name}</h3>
                      <p className="text-on-surface-variant text-sm mb-6 flex-grow">{contest.description || "A fast-paced contest focusing on critical algorithmic concepts."}</p>
                      <div className="flex items-center justify-between mt-auto pt-4 border-t border-outline-variant/50">
                        {contest.isRegistered ? (
                          <>
                            <div className="flex items-center gap-2 text-primary font-medium text-sm font-label-sm">
                              <span className="material-symbols-outlined text-[18px]">check_circle</span>
                              Registered
                            </div>
                            <Link href={`/internal/contests/${contest._id}`}>
                              <button className="px-4 py-2 border border-outline-variant text-on-surface-variant rounded font-label-sm hover:text-on-surface hover:border-outline transition-colors">Details</button>
                            </Link>
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-on-surface-variant">{contest.participantsCount || 0} Registered</span>
                            <Link href={`/internal/contests/${contest._id}`}>
                              <button className="px-4 py-2 border border-primary text-primary rounded font-label-sm hover:bg-primary/10 transition-colors">Register</button>
                            </Link>
                          </>
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
                          <tr key={contest._id} className="border-b border-outline-variant/50 hover:bg-surface-variant/30 transition-colors cursor-pointer group hover:bg-primary/5" role="button">
                            <td className="p-4 text-on-surface font-medium">
                              <Link href={`/internal/contests/${contest._id}`} className="block w-full">{contest.name}</Link>
                            </td>
                            <td className="p-4 text-on-surface-variant">
                              {contest.startTime ? new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(contest.startTime)) : "-"}
                            </td>
                            <td className="p-4"><span className="px-2 py-1 bg-surface-variant text-on-surface-variant rounded text-xs font-label-sm capitalize">{contest.format === "bracket" ? "Knockout" : contest.mode === "arena" ? "Arena" : contest.mode === "blitz" ? "Blitz" : contest.format}</span></td>
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
                <p className="text-on-surface-variant">There are no contests matching your selected format.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
