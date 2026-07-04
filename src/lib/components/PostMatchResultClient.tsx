"use client";

import Link from "next/link";


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
  contestId?: string;
  terminationReason?: string;
};

export default function PostMatchResultClient({ matchData, currentUserId, from }: { matchData: MatchData; currentUserId?: string; from?: string }) {
  let backHref = "/internal/contests/history";
  let backText = "Back to Match History";
  
  if (from === "listing") {
    backHref = "/internal/contests";
    backText = "Back to Contest Listing";
  } else if (from === "bracket" && matchData.contestId) {
    backHref = `/internal/contests/${matchData.contestId}`;
    backText = "Back to Bracket Canvas";
  }
  
  const currentUserTeam = matchData.teams.find(t => t.members.some(m => m.id === currentUserId));

  const getProblemUrl = (problemId: string) => {
    const match = problemId.match(/^(\d+)([A-Za-z].*)$/);
    if (match) {
      return `https://codeforces.com/problemset/problem/${match[1]}/${match[2]}`;
    }
    return `https://codeforces.com/problemset/problem/${problemId}`; // fallback
  };

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
          .glow-emerald-hover:hover {
              box-shadow: 0 0 20px rgba(46, 125, 50, 0.6) !important;
              border-color: rgba(46, 125, 50, 0.8) !important;
              transform: scale(1.01);
              z-index: 10;
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
          <section className="flex flex-col items-center justify-center text-center gap-[24px] py-[24px]">
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

          {/* Termination Reason Banner */}
          {matchData.terminationReason === "disconnect" && (
            <div className="w-full bg-error/10 border border-error/30 rounded-xl p-[16px] flex items-center justify-center gap-3 text-error">
              <span className="material-symbols-outlined text-[24px]">person_off</span>
              <span className="font-label-sm text-sm uppercase tracking-wider font-bold">Match concluded early: Won due to disconnection of other users</span>
            </div>
          )}

          {/* Advancement Banner */}
          {matchData.isKnockout && (
            <div className="w-full bg-gradient-to-r from-surface-container via-surface-container-high to-surface-container rounded-xl card-border p-[24px] flex items-center justify-center gap-4 shadow-lg relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-cover bg-center mix-blend-overlay"></div>
              <span className="material-symbols-outlined text-primary text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>military_tech</span>
              <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface z-10">✨ MATCH COMPLETED</h3>
            </div>
          )}

          {/* Grid Layout for MVP and Problems */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[32px] pb-12">
            {/* MVP & Team Standings Section */}
            <section className="lg:col-span-1 flex flex-col gap-[24px]">
              <h4 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface border-b border-outline-variant pb-2">Standings & MVP</h4>
              
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
              
              {/* Team Standings */}
              <div className="flex flex-col gap-[16px]">
                {matchData.teams.map((team, tIdx) => (
                  <div key={team.id} className="bg-surface-container rounded-xl card-border overflow-hidden">
                    <div className="bg-surface-container-high p-3 flex justify-between items-center border-b border-outline-variant/50">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-on-surface-variant text-sm">#{tIdx + 1}</span>
                        <span className="font-body-md font-bold text-on-surface">{team.name}</span>
                      </div>
                      <span className="font-body-md text-primary font-bold">{team.score} pts</span>
                    </div>
                    <div className="flex flex-col divide-y divide-outline-variant/30">
                      {team.members.map(member => (
                        <div key={member.id} className="p-3 flex items-center justify-between hover:bg-surface-container-high/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <img src={member.avatar} alt={member.handle} className="w-8 h-8 rounded-full object-cover border border-outline-variant" />
                            <span className="font-label-sm text-sm text-on-surface">{member.handle}</span>
                          </div>
                          <span className="font-label-sm text-sm text-on-surface-variant">+{member.contribution || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Problem Matrix Section */}
            <section className="lg:col-span-2 flex flex-col gap-[24px]">
              <h4 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface border-b border-outline-variant pb-2">Problem Matrix</h4>
              <div className="bg-surface-container rounded-xl card-border overflow-hidden p-4 grid gap-3">
                {matchData.problems.length > 0 ? matchData.problems.map((prob) => {
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
                      className={`block bg-surface-container-high rounded-lg p-4 transition-all duration-300 card-border relative cursor-pointer glow-emerald-hover ${prob.solved ? 'opacity-100' : 'opacity-70'}`}
                    >
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`w-1.5 h-10 rounded-full ${prob.solved ? (isUserTeam ? 'bg-primary' : 'bg-outline-variant') : 'bg-outline-variant'}`}></div>
                          <div className="flex flex-col">
                            <span className={`font-body-md font-bold text-on-surface ${!prob.solved ? 'line-through decoration-outline-variant/70 text-on-surface-variant' : ''}`}>
                              {prob.id} - {prob.name}
                            </span>
                            <div className={`font-label-sm text-[12px] flex items-center gap-1 mt-1 ${prob.solved ? (isUserTeam ? 'text-primary' : 'text-on-surface-variant') : 'text-on-surface-variant'}`}>
                              <span className="material-symbols-outlined text-[14px]">
                                {prob.solved ? (isUserTeam ? 'check_circle' : 'lock') : 'lock'}
                              </span>
                              {prob.solved ? `Solved by ${prob.solver?.teamName}` : 'Unsolved'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-right shrink-0">
                          <div className="flex flex-col items-end">
                            <span className="font-label-sm text-[11px] text-on-surface-variant uppercase">Rating</span>
                            <span className={`font-body-md font-medium ${prob.solved ? (isUserTeam ? 'text-primary' : 'text-on-surface-variant') : 'text-on-surface-variant'}`}>
                              {prob.rating || '--'}
                            </span>
                          </div>
                          
                          <div className="flex flex-col items-end min-w-[100px]">
                            <span className="font-label-sm text-[11px] text-on-surface-variant uppercase">Solver</span>
                            {prob.solved && prob.solver ? (
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-label-sm text-sm text-on-surface truncate max-w-[100px]" title={prob.solver.userName}>{prob.solver.userName}</span>
                                <img alt={prob.solver.userName} className={`w-5 h-5 rounded-full object-cover border ${isUserTeam ? 'border-primary' : 'border-error grayscale'}`} src={prob.solver.userAvatar}/>
                              </div>
                            ) : (
                              <span className="font-label-sm text-sm text-on-surface-variant italic mt-0.5">--</span>
                            )}
                          </div>

                          <div className="flex flex-col items-end min-w-[70px]">
                            <span className="font-label-sm text-[11px] text-on-surface-variant uppercase">Time</span>
                            <span className="font-label-sm text-sm text-on-surface-variant italic mt-0.5">
                              {prob.solved && prob.solver ? `${Math.floor(prob.solver.solveMs / 60000)}m ${Math.floor((prob.solver.solveMs % 60000) / 1000)}s` : '--'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </a>
                  );
                }) : (
                  <div className="p-[32px] text-center font-body-md text-on-surface-variant italic">
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
