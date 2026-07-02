"use client";

import Link from "next/link";
import "@/styles/stitch.css";

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
      userAvatar: string;
      teamId: string;
      teamName: string;
      solveMs: number;
    } | null;
  }[];
  mvp: {
    userId: string;
    name: string;
    avatar: string;
    teamName: string;
    contribution: number;
  } | null;
  isKnockout: boolean;
};

export default function PostMatchResultClient({ matchData, from }: { matchData: MatchData; from?: string }) {
  const isFromListing = from === "listing";
  const backHref = isFromListing ? "/internal/contests" : "/internal/contests/history";
  const backText = isFromListing ? "Back to Contest Listing" : "Back to Match History";

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600;700&family=Inter:wght@400&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"/>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>

      <div className="flex-1 flex flex-col overflow-hidden relative dark stitch-container bg-background text-on-background font-body-md text-body-md antialiased min-h-screen">
        <style>{`
          .material-symbols-outlined {
              font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
          }
          .glow-emerald {
              box-shadow: 0 0 40px rgba(46, 125, 50, 0.3);
          }
          .card-border {
              border: 1px solid rgba(255, 255, 255, 0.1);
          }
        `}</style>
        
        <main className="flex-1 w-full max-w-container-max-width mx-auto px-margin-mobile md:px-margin-desktop py-[32px] flex flex-col gap-[48px] overflow-y-auto">
          {/* Breadcrumb */}
          <Link href={backHref} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors w-fit">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span className="font-label-sm text-label-sm uppercase tracking-wider">{backText}</span>
          </Link>

          {/* Hero Section */}
          <section className="flex flex-col items-center justify-center text-center gap-[24px] py-[48px]">
            <div className="flex flex-col md:flex-row items-center justify-center gap-[32px] md:gap-[48px] flex-wrap">
              {matchData.teams.slice(0, 3).map((team, index) => {
                const isWinner = index === 0 && matchData.teams.length > 0;
                return (
                  <div key={team.id} className="flex items-center gap-[32px] md:gap-[48px]">
                    {index > 0 && (
                      <span className="font-headline-lg text-headline-lg text-on-surface-variant opacity-50 hidden md:block">-</span>
                    )}
                    <div className={`flex flex-col items-center gap-unit ${isWinner ? 'relative' : 'opacity-70'}`}>
                      {isWinner && (
                        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-primary-container text-white font-label-sm text-label-sm px-4 py-1 rounded-full uppercase tracking-widest flex items-center gap-1 shadow-[0_0_15px_rgba(46,125,50,0.5)]">
                          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                          WINNER
                        </div>
                      )}
                      <h2 className={`font-headline-lg text-headline-lg tracking-tight ${isWinner ? 'text-primary glow-emerald rounded-full px-4 text-center' : 'text-on-surface text-center'}`}>{team.name}</h2>
                      <span className={`font-display-lg text-display-lg ${isWinner ? 'text-primary-fixed' : 'text-on-surface'}`}>{team.score}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mt-[16px]">
              {matchData.roomType} • <span className="text-primary font-bold">{matchData.duration}</span>
            </p>
          </section>

          {/* Advancement Banner */}
          {matchData.isKnockout && (
            <div className="w-full bg-gradient-to-r from-surface-container via-surface-container-high to-surface-container rounded-xl card-border p-[24px] flex items-center justify-center gap-4 shadow-lg relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-cover bg-center mix-blend-overlay"></div>
              <span className="material-symbols-outlined text-primary text-[32px] z-10" style={{ fontVariationSettings: "'FILL' 1" }}>military_tech</span>
              <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface z-10">✨ MATCH COMPLETED</h3>
            </div>
          )}

          {/* Grid Layout for MVP and Problems */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[32px] pb-12">
            {/* MVP Section */}
            <section className="lg:col-span-1 flex flex-col gap-[24px]">
              <h4 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface border-b border-outline-variant pb-2">Top Performers</h4>
              
              {/* MVP Card */}
              {matchData.mvp ? (
                <div className="bg-surface-container rounded-xl p-[24px] card-border border-primary/50 relative overflow-hidden group hover:bg-surface-container-high transition-colors">
                  <div className="absolute top-0 right-0 p-3 bg-primary-container rounded-bl-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  </div>
                  <div className="flex items-center gap-[16px] mb-[16px]">
                    <img alt={matchData.mvp.name} className="w-16 h-16 rounded-full object-cover border-2 border-primary p-1" src={matchData.mvp.avatar}/>
                    <div>
                      <div className="font-label-sm text-label-sm text-primary mb-1 uppercase tracking-widest flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">emoji_events</span> Match MVP
                      </div>
                      <h5 className="font-body-md text-body-md font-bold text-on-surface">{matchData.mvp.name}</h5>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">{matchData.mvp.teamName}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-end border-t border-outline-variant pt-[16px]">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Total Contribution</span>
                    <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary font-bold">+{matchData.mvp.contribution} pts</span>
                  </div>
                </div>
              ) : (
                <div className="bg-surface-container rounded-xl p-[24px] card-border border-outline-variant relative overflow-hidden group">
                  <div className="flex flex-col items-center justify-center h-[120px] opacity-60">
                     <span className="material-symbols-outlined text-[32px] mb-2">person_off</span>
                     <span className="font-body-md text-on-surface-variant">No solves this match</span>
                  </div>
                </div>
              )}
              
              {/* Other Performers List - Top 3 other than MVP */}
              {matchData.teams.flatMap(t => t.members.map(m => ({ ...m, teamName: t.name })))
                .filter(m => matchData.mvp?.userId !== m.id)
                .slice(0, 3)
                .map((performer, idx) => {
                  // Calculate contribution
                  let contribution = 0;
                  matchData.problems.forEach(p => {
                    if (p.solved && p.solver?.userId === performer.id) {
                      contribution += p.points;
                    }
                  });

                  if (contribution === 0) return null;

                  return (
                    <div key={performer.id} className="bg-surface-container rounded-xl p-[24px] card-border flex flex-col gap-[16px] opacity-80 hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-[16px]">
                        <img alt={performer.name} className="w-12 h-12 rounded-full object-cover border border-outline-variant p-1 grayscale" src={performer.avatar}/>
                        <div>
                          <h5 className="font-body-md text-body-md font-bold text-on-surface">{performer.handle || performer.name}</h5>
                          <span className="font-label-sm text-label-sm text-on-surface-variant">{performer.teamName}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-end border-t border-outline-variant pt-[16px]">
                        <span className="font-label-sm text-label-sm text-on-surface-variant">Total Contribution</span>
                        <span className="font-body-md text-body-md text-on-surface font-bold">+{contribution} pts</span>
                      </div>
                    </div>
                  );
                })
              }
            </section>

            {/* Problem Matrix Section */}
            <section className="lg:col-span-2 flex flex-col gap-[24px]">
              <h4 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface border-b border-outline-variant pb-2">Problem Matrix</h4>
              <div className="bg-surface-container rounded-xl card-border overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-high border-b border-outline-variant font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                      <th className="p-[16px] font-medium">Problem</th>
                      <th className="p-[16px] font-medium">Rating</th>
                      <th className="p-[16px] font-medium">Solved By</th>
                      <th className="p-[16px] font-medium text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {matchData.problems.length > 0 ? matchData.problems.map((prob) => {
                      let isWinnerTeam = false;
                      if (prob.solved && matchData.teams.length > 0) {
                        isWinnerTeam = prob.solver?.teamId === matchData.teams[0].id;
                      }

                      return (
                        <tr key={prob.id} className={`transition-colors ${prob.solved ? 'hover:bg-surface-container-high/50' : 'opacity-60 hover:opacity-80'}`}>
                          <td className="p-[16px]">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-8 rounded-full ${prob.solved ? (isWinnerTeam ? 'bg-primary' : 'bg-error opacity-70') : 'bg-outline-variant'}`}></div>
                              <div>
                                <div className={`font-body-md text-body-md font-bold text-on-surface ${!prob.solved ? 'line-through decoration-outline-variant' : ''}`}>{prob.name}</div>
                                <div className={`font-label-sm text-label-sm flex items-center gap-1 mt-1 ${prob.solved ? (isWinnerTeam ? 'text-primary' : 'text-error') : 'text-on-surface-variant'}`}>
                                  <span className="material-symbols-outlined text-[14px]">
                                    {prob.solved ? 'check_circle' : 'lock'}
                                  </span>
                                  {prob.solved ? 'Solved' : (matchData.roomType.includes("Arena") ? 'Locked' : 'Unsolved')}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className={`p-[16px] font-label-sm text-label-sm ${prob.solved ? (isWinnerTeam ? 'text-secondary' : 'text-error') : 'text-on-surface-variant'}`}>
                            {prob.rating || '--'}
                          </td>
                          <td className="p-[16px]">
                            {prob.solved && prob.solver ? (
                              <div className="flex items-center gap-2">
                                <img alt={prob.solver.userName} className={`w-6 h-6 rounded-full object-cover border ${isWinnerTeam ? 'border-primary' : 'border-error grayscale'}`} src={prob.solver.userAvatar}/>
                                <span className="font-body-md text-body-md text-on-surface">{prob.solver.userName}</span>
                              </div>
                            ) : (
                              <span className="font-label-sm text-label-sm text-on-surface-variant italic">--</span>
                            )}
                          </td>
                          <td className="p-[16px] font-label-sm text-label-sm text-on-surface-variant text-right italic">
                            {prob.solved && prob.solver ? `${Math.floor(prob.solver.solveMs / 60000)}m ${Math.floor((prob.solver.solveMs % 60000) / 1000)}s` : '--'}
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={4} className="p-[32px] text-center font-body-md text-on-surface-variant italic">
                          No problems recorded for this match.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}
