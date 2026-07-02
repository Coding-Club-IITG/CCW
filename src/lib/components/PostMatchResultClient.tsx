"use client";

import Link from "next/link";
import "@/styles/stitch.css";

export default function PostMatchResultClient({ contestId, from }: { contestId: string; from?: string }) {
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
            <div className="flex flex-col md:flex-row items-center gap-[32px] md:gap-[64px]">
              {/* Team Alpha (Winner) */}
              <div className="flex flex-col items-center gap-unit relative">
                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-primary-container text-white font-label-sm text-label-sm px-4 py-1 rounded-full uppercase tracking-widest flex items-center gap-1 shadow-[0_0_15px_rgba(46,125,50,0.5)]">
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                  WINNER
                </div>
                <h2 className="font-headline-lg text-headline-lg text-primary tracking-tight glow-emerald rounded-full px-4">TEAM ALPHA</h2>
                <span className="font-display-lg text-display-lg text-primary-fixed">450</span>
              </div>
              
              <span className="font-headline-lg text-headline-lg text-on-surface-variant opacity-50 hidden md:block">-</span>
              
              {/* Team Beta */}
              <div className="flex flex-col items-center gap-unit opacity-70">
                <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">TEAM BETA</h2>
                <span className="font-display-lg text-display-lg text-on-surface">200</span>
              </div>
            </div>
            
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mt-[16px]">
              Arena Format • <span className="text-primary font-bold">45m 12s</span>
            </p>
          </section>

          {/* Advancement Banner */}
          <div className="w-full bg-gradient-to-r from-surface-container via-surface-container-high to-surface-container rounded-xl card-border p-[24px] flex items-center justify-center gap-4 shadow-lg relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-cover bg-center mix-blend-overlay"></div>
            <span className="material-symbols-outlined text-primary text-[32px] z-10" style={{ fontVariationSettings: "'FILL' 1" }}>military_tech</span>
            <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface z-10">✨ VICTORY — Advanced to Semi-Finals</h3>
          </div>

          {/* Grid Layout for MVP and Problems */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[32px] pb-12">
            {/* MVP Section */}
            <section className="lg:col-span-1 flex flex-col gap-[24px]">
              <h4 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface border-b border-outline-variant pb-2">Top Performers</h4>
              
              {/* MVP Card */}
              <div className="bg-surface-container rounded-xl p-[24px] card-border border-primary/50 relative overflow-hidden group hover:bg-surface-container-high transition-colors">
                <div className="absolute top-0 right-0 p-3 bg-primary-container rounded-bl-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                </div>
                <div className="flex items-center gap-[16px] mb-[16px]">
                  <img alt="AlexChen Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-primary p-1" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAo8NFaUHNN995Z5taLnXZHtmZLVsBd72pA3y6hERDsR93gSpEzDknulrpXJT-MSOGN1gpF8tVGl4zBmOJ1iF0dg1vwZisSGX1U9irKmqY4xddD0McjnblXYFDa8Fs-QkItYL76EW_x28rzQDbmVM-MzyRIQV95N4lfS1Skxs8A7kWhxoj5Wm6nMi8sYlkeVbKUkcO4f_rD0YUc537BwXaYIP5Q-Oy2ok9IgsOomYPkCUHjzmuMnSzP_W-PC05g_FHtBJH0EzXvqS15"/>
                  <div>
                    <div className="font-label-sm text-label-sm text-primary mb-1 uppercase tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">emoji_events</span> Match MVP
                    </div>
                    <h5 className="font-body-md text-body-md font-bold text-on-surface">AlexChen</h5>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Team Alpha</span>
                  </div>
                </div>
                <div className="flex justify-between items-end border-t border-outline-variant pt-[16px]">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Total Contribution</span>
                  <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary font-bold">+300 pts</span>
                </div>
              </div>
              
              {/* Secondary Performer Card */}
              <div className="bg-surface-container rounded-xl p-[24px] card-border flex flex-col gap-[16px] opacity-80 hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-[16px]">
                  <img alt="DavidP Avatar" className="w-12 h-12 rounded-full object-cover border border-outline-variant p-1 grayscale" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBIcU9lAOgwJ9KSD3AubF-VhOamT6SfNTdMaMfH45kqvnjjd1x8a919-VSS37O2yCuHsgruiFUOR7iS8zwnWGig6eqxlPc1gMuF2p_yl_U8dZomVWPbWjLlmqSqX4rtsqU715wO-TWgPw_rjMiC6R-v0vH9M3801qOKtxB4-ovSJLWFTJEQIGBqlKwE5LUlhu3bwUWS5lXlcV712Gm2R4WTsd-aUFFDL1RgQLkMs-0ksJIEr6E7nIFk9SYMSoFSqxbCwkvzVMKKK5Ai"/>
                  <div>
                    <h5 className="font-body-md text-body-md font-bold text-on-surface">DavidP</h5>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Team Beta</span>
                  </div>
                </div>
                <div className="flex justify-between items-end border-t border-outline-variant pt-[16px]">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Total Contribution</span>
                  <span className="font-body-md text-body-md text-on-surface font-bold">+180 pts</span>
                </div>
              </div>
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
                    {/* Problem 1: Solved by Alpha */}
                    <tr className="hover:bg-surface-container-high/50 transition-colors">
                      <td className="p-[16px]">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-8 bg-primary rounded-full"></div>
                          <div>
                            <div className="font-body-md text-body-md font-bold text-on-surface">154A - Pathfinding Grids</div>
                            <div className="font-label-sm text-label-sm text-primary flex items-center gap-1 mt-1">
                              <span className="material-symbols-outlined text-[14px]">check_circle</span> Solved
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-[16px] font-label-sm text-label-sm text-secondary">1400</td>
                      <td className="p-[16px]">
                        <div className="flex items-center gap-2">
                          <img alt="AlexChen" className="w-6 h-6 rounded-full object-cover border border-primary" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDY6ERcekRwZeznOOhBBEKuu-op7HBpBDhzf1CuAG4TWGt0bxdEDcezDV56mkpfEUIVNC0kMY5KFyyrr6zHCZMhDAmPsFrvRxfkFFCTNWRmQLR3CFpTNroCPMBquTIXT-H2IaI7aoP2snX-r_zTR4JZbbyQh7BH34v8nAAK6tMDnh1HCyiAOM6FOwGKd7scoGal-9KMmS8ZWVD9fue4g1XKD6_SRaqJ5of4jN01PXNiv-VlQ_lj6X7zFYyGRdOf9W8RzpgpRcsHDeHW"/>
                          <span className="font-body-md text-body-md text-on-surface">AlexChen</span>
                        </div>
                      </td>
                      <td className="p-[16px] font-label-sm text-label-sm text-on-surface-variant text-right">12m</td>
                    </tr>
                    
                    {/* Problem 2: Solved by Beta */}
                    <tr className="hover:bg-surface-container-high/50 transition-colors">
                      <td className="p-[16px]">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-8 bg-error rounded-full opacity-70"></div>
                          <div>
                            <div className="font-body-md text-body-md font-bold text-on-surface">154B - Tree Rotations</div>
                            <div className="font-label-sm text-label-sm text-error flex items-center gap-1 mt-1">
                              <span className="material-symbols-outlined text-[14px]">check_circle</span> Solved
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-[16px] font-label-sm text-label-sm text-error">1800</td>
                      <td className="p-[16px]">
                        <div className="flex items-center gap-2">
                          <img alt="DavidP" className="w-6 h-6 rounded-full object-cover border border-error grayscale" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAlfJyyjdYI8_SQOfZEmvHNoAZC4mA9ceLRKw0ttd2GiHwHXO37Ago-P9EkvLufeAfzWM73BAmGvSvqacSg4JwGcSp36vjNS09E-kAHMWBuNLea9dlQGpFzsfH90nWwcPDVzzh8fR4FdwqN14v8_zC8PeUzvcptXawxKxrLo1EX0iSiUH2K6F2LUeIB299fKkcWRitVKa5aQQVl8ZceXrditH-_GmNoZImuUHLcsrB8wFnNtWIigfRnm_1KoUPhHesIALcZxwKB0h5D"/>
                          <span className="font-body-md text-body-md text-on-surface">DavidP</span>
                        </div>
                      </td>
                      <td className="p-[16px] font-label-sm text-label-sm text-on-surface-variant text-right">34m</td>
                    </tr>
                    
                    {/* Problem 3: Unsolved */}
                    <tr className="hover:bg-surface-container-high/50 transition-colors opacity-60">
                      <td className="p-[16px]">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-8 bg-outline-variant rounded-full"></div>
                          <div>
                            <div className="font-body-md text-body-md font-bold text-on-surface line-through decoration-outline-variant">154C - Dynamic Flow</div>
                            <div className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1 mt-1">
                              <span className="material-symbols-outlined text-[14px]">lock</span> Locked / Unsolved
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-[16px] font-label-sm text-label-sm text-on-surface-variant">2200</td>
                      <td className="p-[16px] font-label-sm text-label-sm text-on-surface-variant italic">--</td>
                      <td className="p-[16px] font-label-sm text-label-sm text-on-surface-variant text-right italic">--</td>
                    </tr>
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
