"use client";

import { useState } from "react";
import Link from "next/link";

import { ContestListingItem } from "@/lib/actions/contests";

export default function MatchHistoryClient({ history }: { history: ContestListingItem[] }) {
  const [formatFilter, setFormatFilter] = useState("Format: All");
  const [outcomeFilter, setOutcomeFilter] = useState("Outcome: All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredHistory = history.filter((contest) => {
    // format filter
    if (formatFilter !== "Format: All") {
      const modeLower = (contest.mode || contest.format).toLowerCase();
      if (formatFilter.toLowerCase() !== modeLower) return false;
    }
    
    // outcome filter
    if (outcomeFilter !== "Outcome: All") {
      const result = contest.result;
      if (outcomeFilter === "Victory" && result !== "victory") return false;
      if (outcomeFilter === "Defeat" && result !== "loss") return false;
      if (outcomeFilter === "Tie" && result !== "tie") return false;
    }
    
    // date filter
    if (startDate) {
      if (!contest.startTime) return false;
      const [y, m, d] = startDate.split('-');
      const startOfDay = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 0, 0, 0, 0);
      if (new Date(contest.startTime).getTime() < startOfDay.getTime()) return false;
    }
    if (endDate) {
      if (!contest.startTime) return false;
      const [y, m, d] = endDate.split('-');
      const endOfDay = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 23, 59, 59, 999);
      if (new Date(contest.startTime).getTime() > endOfDay.getTime()) return false;
    }
    
    return true;
  });

  filteredHistory.sort((a, b) => {
    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
    return timeB - timeA;
  });

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@100..900&family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..900&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      
      <div className="flex-1 flex flex-col overflow-hidden relative dark stitch-container bg-background text-on-background font-body-md min-h-screen selection:bg-primary-container selection:text-on-primary-container">
        <style>{`
          .glowing-tournament-tag {
            box-shadow: 0 0 10px rgba(255, 177, 199, 0.4); 
          }
          .bg-pattern {
            background-image: radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 24px 24px;
          }
        `}</style>
        
        <div className="absolute inset-0 bg-pattern pointer-events-none"></div>

        <main className="max-w-container-max-width mx-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12 relative z-10 w-full flex-1 overflow-y-auto">
          {/* Breadcrumb */}
          <Link href="/internal/contests" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors duration-200 font-label-sm text-label-sm mb-6">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Contests
          </Link>

          {/* Page Header */}
          <header className="mb-10">
            <h1 className="font-display-lg text-display-lg text-on-surface mb-2">Match History</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Review your recent algorithmic battles and performance metrics.</p>
          </header>

          {/* Top Control Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-surface-container p-4 rounded-xl border border-outline-variant">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              {/* Format Filter */}
              <div className="relative flex items-center">
                <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="appearance-none bg-surface-container-highest border border-outline-variant text-on-surface font-label-sm text-label-sm rounded-lg py-2 pl-4 pr-10 hover:bg-surface-variant transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                  <option>Format: All</option>
                  <option>Blitz</option>
                  <option>Arena</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 text-on-surface-variant pointer-events-none text-[18px]">expand_more</span>
              </div>
              {/* Outcome Filter */}
              <div className="relative flex items-center">
                <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)} className="appearance-none bg-surface-container-highest border border-outline-variant text-on-surface font-label-sm text-label-sm rounded-lg py-2 pl-4 pr-10 hover:bg-surface-variant transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                  <option>Outcome: All</option>
                  <option>Victory</option>
                  <option>Tie</option>
                  <option>Defeat</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 text-on-surface-variant pointer-events-none text-[18px]">expand_more</span>
              </div>
              {/* Date Filter */}
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                  className="bg-surface-container-highest border border-outline-variant text-on-surface font-label-sm text-label-sm rounded-lg py-1.5 px-3 hover:bg-surface-variant transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary h-[36px]"
                />
                <span className="text-on-surface-variant text-sm">-</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)} 
                  className="bg-surface-container-highest border border-outline-variant text-on-surface font-label-sm text-label-sm rounded-lg py-1.5 px-3 hover:bg-surface-variant transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary h-[36px]"
                />
              </div>
            </div>
          </div>

          {/* Match History List */}
          <div className="flex flex-col gap-4">
            {filteredHistory.map((contest) => {
              const result = contest.result;
              const isVictory = result === "victory";
              const isTie = result === "tie";
              const outcomeScore = contest.userScore ?? 0;
              const otherScores = contest.otherScores && contest.otherScores.length > 0 
                ? contest.otherScores 
                : [contest.opponentScore ?? 0];
              
              // Border and badge colors based on three-state result
              const borderClass = isVictory ? 'border-l-primary' : isTie ? 'border-l-tertiary' : 'border-l-outline opacity-90';
              
              return (
                <div key={contest._id} className={`group bg-surface-container-low border-y border-r border-l-4 border-outline-variant ${borderClass} rounded-xl p-gutter flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:bg-surface-container transition-colors duration-200`}>
                  {/* Left: Info */}
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {isVictory ? (
                        <span className="bg-primary-container text-on-primary-container font-label-sm text-label-sm px-2 py-0.5 rounded">VICTORY</span>
                      ) : isTie ? (
                        <span className="bg-tertiary-container text-on-tertiary-container font-label-sm text-label-sm px-2 py-0.5 rounded">TIE</span>
                      ) : (
                        <span className="bg-surface-variant text-on-surface font-label-sm text-label-sm px-2 py-0.5 rounded border border-outline">DEFEAT</span>
                      )}
                      
                      <span className="bg-surface-variant text-on-surface-variant font-label-sm text-label-sm px-2 py-0.5 rounded border border-outline-variant capitalize">{contest.mode || contest.format}</span>
                      
                      {/* Tournament Tag */}
                      {contest.format === 'bracket' && (
                        <div className="flex items-center gap-1 bg-tertiary-container/20 text-tertiary border border-tertiary/50 font-label-sm text-label-sm px-2 py-0.5 rounded glowing-tournament-tag">
                          <span className="material-symbols-outlined text-[14px]">emoji_events</span>
                          {contest.name}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-outline">calendar_today</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {contest.startTime ? new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(contest.startTime)) : "-"}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
                      <span className="material-symbols-outlined text-outline">timer</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {contest.startTime && contest.endTime ? 
                          (() => {
                            const diffMs = new Date(contest.endTime).getTime() - new Date(contest.startTime).getTime();
                            if (diffMs > 0) {
                              const totalSeconds = Math.floor(diffMs / 1000);
                              const minutes = Math.floor(totalSeconds / 60);
                              const seconds = totalSeconds % 60;
                              return `${minutes}m ${seconds}s`;
                            }
                            return "0m 0s";
                          })()
                        : `${Math.floor((contest.durationSeconds || 3600) / 60)}m`}
                      </span>
                    </div>
                  </div>

                  {/* Middle: Score */}
                  <div className="flex items-center justify-center min-w-[200px]">
                    <div className="text-center flex items-baseline gap-4">
                      <span className={`font-headline-lg text-headline-lg ${isVictory ? 'text-primary' : isTie ? 'text-tertiary' : 'text-on-surface-variant opacity-70'}`}>{outcomeScore}</span>
                      {otherScores.map((score, idx) => (
                        <div key={idx} className="flex items-baseline gap-4">
                          <span className="font-body-md text-body-md text-outline-variant">-</span>
                          <span className={`font-headline-lg text-headline-lg ${!isVictory && !isTie && score > outcomeScore ? 'text-on-surface' : 'text-on-surface-variant opacity-70'}`}>{score}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: CTA */}
                  <div className="flex items-center justify-end md:w-[150px]">
                    <Link href={`/internal/contests/${contest._id}?from=history`}>
                      <button className="bg-surface-container-highest border border-outline-variant hover:border-primary hover:text-primary text-on-surface font-label-sm text-label-sm px-4 py-2 rounded-lg transition-all duration-200 flex items-center gap-2">
                        Results
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </>
  );
}
