"use client";

import Link from "next/link";
import { ContestListingItem } from "@/lib/actions/contests";
import "@/styles/stitch.css";
import { useEffect, useState } from "react";

export default function ArenaRoomClient({ contest }: { contest: ContestListingItem }) {
  const [timeLeft, setTimeLeft] = useState<string>("00:00");

  useEffect(() => {
    let totalSeconds = contest.durationSeconds || 45 * 60 + 32;
    
    const interval = setInterval(() => {
      if (totalSeconds <= 0) return;
      totalSeconds--;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [contest]);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hanken+Grotesk:wght@600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <div className="flex-1 flex flex-col overflow-hidden relative dark stitch-container bg-background w-full h-full text-on-background font-body-md selection:bg-primary-container selection:text-on-primary-container">
        <style>{`
          .cyber-glow { box-shadow: 0 0 15px rgba(136, 217, 130, 0.2); }
          .cyber-glow-error { box-shadow: 0 0 15px rgba(255, 180, 171, 0.1); }
          .scroll-hide::-webkit-scrollbar { display: none; }
          .scroll-hide { -ms-overflow-style: none; scrollbar-width: none; }
          .bg-pattern { background-image: radial-gradient(rgba(136, 217, 130, 0.05) 1px, transparent 1px); background-size: 24px 24px; }
        `}</style>
        <div className="absolute inset-0 bg-pattern opacity-30 pointer-events-none"></div>
        
        {/* Main Content Canvas */}
        <main className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-6 relative z-10 max-w-container-max-width mx-auto w-full">
          <div className="flex items-center">
            <Link href="/internal/contests" className="flex items-center gap-2 px-3 py-1.5 text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20 rounded-lg transition-all font-label-sm text-label-sm uppercase tracking-wider">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>Back to Contests
            </Link>
          </div>
          
          {/* Compact HUD */}
          <header className="flex justify-between items-center bg-surface-container-low border border-outline-variant p-4 rounded-xl cyber-glow">
            <div className="flex items-center gap-4">
              <h1 className="font-headline-lg text-[20px] text-on-surface tracking-tight">{contest.name}</h1>
              <div className="flex items-center gap-2 px-3 py-1 bg-surface-container border border-primary/30 rounded-full text-primary font-label-sm text-xs uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                {contest.status === 'active' ? 'LIVE MATCH' : 'UPCOMING'}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 font-headline-lg text-[24px]">
                <span className="text-primary">Team Alpha</span>
                <span className="text-on-surface font-bold">350</span>
                <span className="text-outline-variant font-body-md text-body-md">VS</span>
                <span className="text-on-surface font-bold">150</span>
                <span className="text-error">Team Beta</span>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-surface-container py-2 px-4 border border-outline-variant rounded-lg">
              <span className="material-symbols-outlined text-primary">timer</span>
              <span className="font-label-sm text-label-sm text-on-surface">{timeLeft} <span className="text-on-surface-variant text-xs">remaining</span></span>
            </div>
          </header>

          {/* 3-Column Layout */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-hidden">
            {/* Left Sidebar (Roster) */}
            <div className="lg:col-span-1 flex flex-col h-full overflow-hidden">
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col gap-4 h-full overflow-y-auto scroll-hide">
                <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest sticky top-0 bg-surface-container-low z-10 pb-2 border-b border-outline-variant/50">Active Roster</h2>
                
                <div className="flex flex-col gap-2">
                  <span className="font-label-sm text-[10px] text-primary uppercase tracking-widest pb-1 mb-1">Team Alpha</span>
                  <div className="flex items-center gap-3 p-2 rounded bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors border-l-2 border-primary">
                    <img alt="UserA" className="w-6 h-6 rounded-full border border-primary" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDSXBNIEm7AbEAFeoK2JA3WZItzjFAaFxuzs3MqObfgBKNyQtx3_xrLhR1Af0LBpXeFM6aqvaUDp14Qz_QV2sh1lZ_Wm5gc1jIXa4UgTWQr9ftBjrD0KDqXWrmNDMHkgEJTew0-AJdOOEq7AE9v926CtKMIZXiJzr2SVPzNqF5BsIaE30L4CzuYpKsH5sgdtxjkbKeKkk7FduqF4sYxOFzO_1FFh9GbAjFf6YgyTCC7ipq4gWPManLlfko7nCHtT4cMxEX9FbG1UWKb" />
                    <span className="font-label-sm text-sm text-on-surface flex-1">UserA</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors border-l-2 border-primary">
                    <div className="w-6 h-6 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center text-[10px] font-label-sm">UB</div>
                    <span className="font-label-sm text-sm text-on-surface flex-1">UserB</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors border-l-2 border-primary">
                    <div className="w-6 h-6 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center text-[10px] font-label-sm">UC</div>
                    <span className="font-label-sm text-sm text-on-surface flex-1">UserC</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-4">
                  <span className="font-label-sm text-[10px] text-error uppercase tracking-widest pb-1 mb-1">Team Beta</span>
                  <div className="flex items-center gap-3 p-2 rounded bg-surface-variant/10 opacity-70 border-l-2 border-error">
                    <img alt="UserD" className="w-6 h-6 rounded-full border border-error" src="https://lh3.googleusercontent.com/aida-public/AB6AXuANi0TM4Lf0A3E8_pEIIiorBQdMDeqM0aTIlGp0lftVg6lzF436Xtq9Fpkce_iqeZNVWN1VDtPYKi4BUzzDAeOC2Sk2e-xRunrM2OFV9bUgf0OtqZr__gXTw08-PJUkA8wWB7AJYTMatkvqJhZ-gKNQAqu7ls2QuJHuoh4rRrUHxYKEOBKYGbQNPw7GJq948D5m0rYZJU8bEfvrzpkBJ7Xoct3SfQ4GhwXRPkSrn-kNaKNtMc0m4Ohsfs8TBsJV5L5INpIgFnQxvTwl" />
                    <span className="font-label-sm text-sm text-on-surface flex-1">UserD</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-error"></div>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-surface-variant/10 opacity-70 border-l-2 border-error">
                    <div className="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center text-[10px] font-label-sm text-error">UE</div>
                    <span className="font-label-sm text-sm text-on-surface flex-1">UserE</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-error"></div>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded bg-surface/50 opacity-40 border-l-2 border-outline-variant grayscale">
                    <span className="material-symbols-outlined text-outline-variant text-lg">person_off</span>
                    <span className="font-label-sm text-sm text-on-surface-variant flex-1 line-through">UserF</span>
                    <span className="font-label-sm text-[10px] text-outline-variant">FF</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Center Stage - Problem Grid */}
            <div className="lg:col-span-2 flex flex-col h-full overflow-hidden">
              <div className="flex-1 flex flex-col bg-surface-container-low border border-outline-variant rounded-xl p-6 overflow-y-auto scroll-hide">
                <div className="flex justify-between items-center mb-6 sticky top-0 bg-surface-container-low z-20 pb-2 border-b border-outline-variant/50">
                  <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Problem Grid</h2>
                  <button className="bg-primary-container text-on-primary-container font-label-sm text-label-sm px-4 py-2 rounded border border-primary hover:bg-primary hover:text-on-primary transition-all flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">sync</span>
                    Sync Submission
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max">
                  {/* Claimed by My Team (Alpha) */}
                  <div className="bg-surface border-2 border-primary p-5 rounded-lg flex flex-col gap-4 cyber-glow relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                      <span className="material-symbols-outlined text-6xl text-primary">check_circle</span>
                    </div>
                    <div className="flex justify-between items-start z-10">
                      <span className="font-label-sm text-label-sm bg-primary-container text-on-primary-container px-2 py-1 rounded">1200</span>
                      <span className="material-symbols-outlined text-on-surface-variant">code</span>
                    </div>
                    <div className="z-10">
                      <h3 className="font-label-sm text-label-sm text-on-surface mb-1 truncate">Matrix Rotation</h3>
                      <p className="text-xs text-on-surface-variant font-label-sm">Codeforces</p>
                    </div>
                    <div className="mt-auto pt-4 border-t border-outline-variant flex items-center gap-3 z-10">
                      <img alt="UserA" className="w-6 h-6 rounded-full border border-primary" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDetlu1CNB-5yYt5_i6meFY01MZSZ2bsYm3DaoLiwClcLkwt1X-2e8R5iFXnUNy5lEHstd_pn7sSPyUkaIvluI2CENtWGLqSs-DkEkPsuaODbMGvm3VYyDa02fYhQWzKMJCcfqp13-YNFfHk4rr7sMSm_JW4WLAmjh2QMxsmaSdmv-wsLCSaTBxPW50b01Kfs_erHLoCewcHCoFBl_31JyRsS2P3LUa3Xr7OKhYY4CnyilxcmGGFbGp88Nc0WzZoeCs9_4TVn_UlguR" />
                      <div className="flex flex-col">
                        <span className="font-label-sm text-xs text-primary">UserA</span>
                        <span className="text-[10px] text-on-surface-variant font-label-sm">Solved 2m ago</span>
                      </div>
                    </div>
                  </div>

                  {/* Claimed by Opponent (Beta) */}
                  <div className="bg-surface border border-error p-5 rounded-lg flex flex-col gap-4 relative overflow-hidden group cursor-help opacity-75" title="Reclaimable if submitted earlier!">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                      <span className="material-symbols-outlined text-6xl text-error">lock</span>
                    </div>
                    <div className="flex justify-between items-start z-10">
                      <span className="font-label-sm text-label-sm bg-error-container text-on-error-container px-2 py-1 rounded border border-error/30">1400</span>
                      <span className="material-symbols-outlined text-error">lock</span>
                    </div>
                    <div className="z-10">
                      <h3 className="font-label-sm text-label-sm text-on-surface mb-1 truncate">Graph Traversal</h3>
                      <p className="text-xs text-on-surface-variant font-label-sm">Codeforces</p>
                    </div>
                    <div className="mt-auto pt-4 border-t border-outline-variant/30 flex items-center gap-3 z-10">
                      <img alt="UserD" className="w-6 h-6 rounded-full border border-error" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB_CYM6X9a4fcHkKvQuwQ5oazQdY8WntNMOM8QX5i_8O-BLZkhGCCp8NBYAm454Sj_TiOxtsLOJ0IP5Mv3iMclRJPlGSz-zKwbsyXyYqhnlF96XU8TFQOdvOFjI591CYv-Jwj-mOjHCLURSgoOuZRfENxCtLLo-JVjdAXopS6PPF4YLu_5rRkTyXJCkTl5qPWnJEsKzdVa5UK0gsTIS8NBWsM38bRKN86Jv1fWXFcbK49Y0Db0p6WkXWEUkMdLsFKChPadjgnqun_AP" />
                      <div className="flex flex-col">
                        <span className="font-label-sm text-xs text-error">UserD</span>
                        <span className="text-[10px] text-on-surface-variant font-label-sm">Locked</span>
                      </div>
                    </div>
                  </div>

                  {/* Unclaimed */}
                  <div className="bg-surface border border-outline-variant p-5 rounded-lg flex flex-col gap-4 hover:border-primary/50 transition-colors cursor-pointer group">
                    <div className="flex justify-between items-start">
                      <span className="font-label-sm text-label-sm bg-surface-variant text-on-surface px-2 py-1 rounded">1600</span>
                      <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">code</span>
                    </div>
                    <div>
                      <h3 className="font-label-sm text-label-sm text-on-surface mb-1 truncate">Greedy Scheduler</h3>
                      <p className="text-xs text-on-surface-variant font-label-sm">Codeforces</p>
                    </div>
                    <div className="mt-auto pt-4 border-t border-outline-variant flex items-center justify-between">
                      <span className="font-label-sm text-xs text-on-surface-variant">Unclaimed</span>
                      <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors text-sm">play_arrow</span>
                    </div>
                  </div>

                  {/* More Unclaimed */}
                  <div className="bg-surface border border-outline-variant p-5 rounded-lg flex flex-col gap-4 hover:border-primary/50 transition-colors cursor-pointer group">
                    <div className="flex justify-between items-start">
                      <span className="font-label-sm text-label-sm bg-surface-variant text-on-surface px-2 py-1 rounded">1800</span>
                      <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">code</span>
                    </div>
                    <div>
                      <h3 className="font-label-sm text-label-sm text-on-surface mb-1 truncate">Dynamic Programming IV</h3>
                      <p className="text-xs text-on-surface-variant font-label-sm">Codeforces</p>
                    </div>
                    <div className="mt-auto pt-4 border-t border-outline-variant flex items-center justify-between">
                      <span className="font-label-sm text-xs text-on-surface-variant">Unclaimed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Sidebar (Activity Log) */}
            <div className="lg:col-span-1 flex flex-col h-full overflow-hidden">
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col h-full overflow-hidden relative">
                <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mb-4 sticky top-0 bg-surface-container-low z-10 pb-2 border-b border-outline-variant/50">Activity Log</h2>
                <div className="flex flex-col gap-3 overflow-y-auto scroll-hide font-label-sm text-xs h-full">
                  <div className="flex gap-2 text-on-surface">
                    <span className="text-primary opacity-70">[10:42]</span>
                    <span className="text-primary">UserA</span>
                    <span className="text-on-surface-variant">claimed</span>
                    <span>Matrix Rotation</span>
                  </div>
                  <div className="flex flex-col gap-1 text-on-surface bg-primary/10 p-2 rounded border-l-2 border-primary">
                    <div className="flex gap-2">
                      <span className="text-primary opacity-70">[10:40]</span>
                      <span className="text-primary font-bold">CRITICAL:</span>
                    </div>
                    <div>
                      <span>Team Alpha</span>
                      <span className="text-primary mx-1">RECLAIMED</span>
                      <span>Graph Traversal from Team Beta!</span>
                    </div>
                  </div>
                  <div className="flex gap-2 text-on-surface-variant opacity-70">
                    <span className="text-outline-variant">[10:35]</span>
                    <span>UserF (Team Beta) disconnected</span>
                  </div>
                  <div className="flex gap-2 text-on-surface-variant">
                    <span className="text-outline-variant">[10:00]</span>
                    <span>Match initialized</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
