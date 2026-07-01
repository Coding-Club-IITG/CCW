"use client";

import Link from "next/link";
import { ContestListingItem } from "@/lib/actions/contests";
import "@/styles/stitch.css";
import { useEffect, useState } from "react";

export default function BlitzRoomClient({ contest }: { contest: ContestListingItem }) {
  const [timeLeft, setTimeLeft] = useState<string>("00:00");

  useEffect(() => {
    // Simple timer simulation based on durationSeconds if provided
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
        .glow-effect { box-shadow: 0 0 15px rgba(136, 217, 130, 0.15); }
        .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
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
              <span className="text-on-surface font-bold">200 pts</span>
              <span className="text-outline-variant font-body-md text-body-md">VS</span>
              <span className="text-secondary font-bold">100 pts</span>
              <span className="text-on-surface-variant">Team Beta</span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-surface-container py-2 px-4 border border-outline-variant rounded-lg">
            <span className="material-symbols-outlined text-error animate-pulse-slow">timer</span>
            <span className="font-label-sm text-label-sm text-error font-bold tracking-widest">{timeLeft}</span>
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
                  <img alt="UserA" className="w-6 h-6 rounded-full object-cover border border-primary" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBgOfwGh6orTfzFDqZfpzO8L3mjt_mmvBFiMHbmfAVu7ZGO5e0-fNBl9dKcAe2k0jpGRCFhq8paBxcP33oi4nmTxc6pkWGQmSQ2ZXzNw_7f2QlRuff_3eH7hN0wbXWLRAQpcM5ZeUm0m9cQuz8R_cuyEYh7O42AqzCCsNdEIw11vUWEYjNS41VOL9JbWKLx8dTf4Iy8wYS7QMMwnhWPAM-fFNSvcc2oma8TawSF_y8OjQXj_RkcZLddx7_gZofYpPrtr29hKTywnKPn" />
                  <span className="font-label-sm text-sm text-on-surface flex-1">UserA (Capt)</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                </div>
                <div className="flex items-center gap-3 p-2 rounded bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors border-l-2 border-primary">
                  <img alt="UserB" className="w-6 h-6 rounded-full object-cover border border-primary" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBUW8iKcGrZbAe3YGSK7w3DNXL4mEN7HY-3VpI5BkbGoYlLkXlw4hKGUbbWLVcNj-EG5YNYrLBvgr46I2ij618Jn4kCLV7nusDZ84sipIbeY49TXFGfi4ysXN39BY2dn1vz-WVwqZ1tF7iRmfkq3p0UMOelodIMhZ1Q96pfXzPyrevPoecDa7GAv_DOQjQjJOLYqKBL50Z---hoMD8tZ6ZFqQ77YXNA2S8vaximLaJekM6HL46y2XIH8NETCDwqsZ5MpwW95SUgORQi" />
                  <span className="font-label-sm text-sm text-on-surface flex-1">UserB</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-4">
                <span className="font-label-sm text-[10px] text-error uppercase tracking-widest pb-1 mb-1">Team Beta</span>
                <div className="flex items-center gap-3 p-2 rounded bg-surface-variant/10 opacity-70 border-l-2 border-primary">
                  <img alt="UserC" className="w-6 h-6 rounded-full object-cover border border-primary" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAEyFxAYsZaFGtvTogQvux0FMqzuipToaS_QplN_5MJhD3fjj-M0KPuu6XZvHraJ4MyhUJTT37l_OsGWuqVhsAaZD_m7fUNyc4cy5jiPJkr4b9xd4iu-o3X5iX8w60jjAEj0TZGnFgF8EaNhteMAOMNeXC67BQtzhDfAtR8GerPoj1WHgre_ZIkg83rOlNwA0Mqx8F1215y1w5rGOcaRhXjLL3Pwk3pcuIf_q9je4bJtgOQOZ0L3AnjlrgdwUr-i_QwPgqDDU-UCBZO" />
                  <span className="font-label-sm text-sm text-on-surface flex-1">UserC (Capt)</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                </div>
                <div className="flex items-center gap-3 p-2 rounded bg-surface/50 opacity-40 border-l-2 border-outline-variant grayscale">
                  <div className="w-6 h-6 rounded-full bg-surface-variant flex items-center justify-center">
                    <span className="material-symbols-outlined text-xs">person_off</span>
                  </div>
                  <div className="flex flex-col flex-1">
                    <span className="font-label-sm text-sm text-on-surface-variant line-through">UserD</span>
                    <span className="text-[10px] text-error font-label-sm">Offline</span>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-error"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Center Stage - Active Problem */}
          <div className="lg:col-span-2 flex flex-col h-full overflow-hidden">
            <div className="flex-1 flex flex-col bg-surface-container-low border border-outline-variant rounded-xl p-6 overflow-y-auto scroll-hide">
              <div className="flex justify-between items-center mb-6 sticky top-0 bg-surface-container-low z-20 pb-2 border-b border-outline-variant/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-sm">target</span>
                  <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest">Problem 2 of 5</span>
                </div>
                <div className="flex gap-1">
                  <div className="h-1.5 w-8 bg-primary rounded-full"></div>
                  <div className="h-1.5 w-8 bg-primary animate-pulse rounded-full cyber-glow"></div>
                  <div className="h-1.5 w-8 bg-surface-variant rounded-full"></div>
                  <div className="h-1.5 w-8 bg-surface-variant rounded-full"></div>
                  <div className="h-1.5 w-8 bg-surface-variant rounded-full"></div>
                </div>
              </div>

              <div className="bg-surface border border-outline-variant rounded-lg relative overflow-hidden flex flex-col p-6">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <span className="material-symbols-outlined text-9xl">code_blocks</span>
                </div>
                <div className="z-10 mb-4">
                  <h1 className="font-headline-lg-mobile md:font-headline-lg text-[32px] md:text-[40px] font-bold text-on-surface mb-2">Codeforces Round #900: Problem C</h1>
                  <div className="flex items-center gap-4 font-label-sm text-label-sm text-on-surface-variant">
                    <span className="flex items-center gap-1 bg-surface-variant text-on-surface px-2 py-1 rounded">
                      <span className="material-symbols-outlined text-[16px]">bar_chart</span>
                      Rating: 1400
                    </span>
                    <span className="flex items-center gap-1 text-primary">
                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                      Revealed 2 mins ago
                    </span>
                  </div>
                </div>

                <div className="border-t border-outline-variant flex items-center gap-4 z-10 mb-4 pt-4 mt-4">
                  <button className="flex items-center gap-2 px-6 border border-outline-variant rounded-lg font-label-sm text-label-sm text-on-surface hover:bg-surface-variant transition-colors py-3">
                    <span className="material-symbols-outlined">open_in_new</span>
                    Open in Codeforces
                  </button>
                  <button className="flex items-center gap-2 px-8 bg-primary-container text-on-primary-container rounded-lg font-label-sm text-label-sm font-bold hover:brightness-110 transition-all cyber-glow py-3">
                    <span className="material-symbols-outlined">sync</span>
                    Sync Submission
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar (Activity Log) */}
          <div className="lg:col-span-1 flex flex-col h-full overflow-hidden">
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col h-full overflow-hidden relative">
              <h2 className="font-label-sm text-label-sm text-on-surface font-bold flex items-center gap-2 mb-4 sticky top-0 bg-surface-container-low z-10 pb-2 border-b border-outline-variant/50">
                <span className="material-symbols-outlined text-primary">rss_feed</span>
                Activity Feed
              </h2>
              <div className="flex flex-col gap-4 overflow-y-auto scroll-hide font-label-sm text-label-sm h-full">
                <div className="flex gap-3">
                  <div className="mt-1"><span className="material-symbols-outlined text-secondary text-sm">info</span></div>
                  <div>
                    <p className="text-on-surface">Problem 2 revealed.</p>
                    <span className="text-on-surface-variant text-[11px]">Just now</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-1"><span className="material-symbols-outlined text-error text-sm">person_off</span></div>
                  <div>
                    <p className="text-on-surface"><span className="font-bold text-error">UserD</span> disconnected.</p>
                    <span className="text-on-surface-variant text-[11px]">1 min ago</span>
                  </div>
                </div>
                <div className="flex gap-3 bg-surface-variant/50 p-2 rounded border border-outline-variant/50">
                  <div className="mt-1"><span className="material-symbols-outlined text-primary text-sm">check_circle</span></div>
                  <div>
                    <p className="text-on-surface"><span className="font-bold text-primary">Team Alpha</span> solved Problem 1 <span className="text-primary">(+100 pts)</span></p>
                    <span className="text-on-surface-variant text-[11px]">2 mins ago</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-1"><span className="material-symbols-outlined text-secondary text-sm">play_arrow</span></div>
                  <div>
                    <p className="text-on-surface">Match started.</p>
                    <span className="text-on-surface-variant text-[11px]">5 mins ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Match Over Overlay Modal */}
      {contest.status === 'completed' && (
        <div className="fixed bottom-gutter right-gutter z-50">
          <div className="bg-surface-container-highest border border-primary/30 rounded-xl p-6 shadow-2xl w-80 relative overflow-hidden cyber-glow">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary"></div>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-3xl">emoji_events</span>
                <h3 className="font-headline-lg-mobile text-[24px] font-bold text-on-surface">Match Over!</h3>
              </div>
              <button className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="font-body-md text-on-surface-variant mb-6">
              <strong className="text-primary text-lg">Team Alpha</strong> dominates the arena with 200 points.
            </p>
            <button className="w-full py-2 bg-surface-variant hover:bg-outline-variant text-on-surface rounded-lg font-label-sm text-label-sm transition-colors border border-outline-variant">
              View Match Results
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
