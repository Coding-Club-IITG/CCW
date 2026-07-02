"use client";

import Link from "next/link";
import { ContestListingItem } from "@/lib/actions/contests";
import "@/styles/stitch.css";
import { useRef, useState } from "react";

export default function BracketRoomClient({ contest }: { contest: ContestListingItem }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDown(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setStartY(e.pageY - scrollRef.current.offsetTop);
    setScrollLeft(scrollRef.current.scrollLeft);
    setScrollTop(scrollRef.current.scrollTop);
  };

  const handleMouseLeave = () => setIsDown(false);
  const handleMouseUp = () => setIsDown(false);
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDown || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const y = e.pageY - scrollRef.current.offsetTop;
    const walkX = (x - startX) * 1.5;
    const walkY = (y - startY) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft - walkX;
    scrollRef.current.scrollTop = scrollTop - walkY;
  };

  const openMatchDetails = (e: React.MouseEvent, matchId: string) => {
    e.stopPropagation();
    setSelectedMatch(matchId);
    setSidebarOpen(true);
  };

  const closeSidebar = () => {
    setSelectedMatch(null);
    setSidebarOpen(false);
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hanken+Grotesk:wght@600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <div className="flex-1 flex flex-col overflow-hidden relative dark stitch-container bg-background w-full h-full text-on-surface font-body-md selection:bg-primary-container selection:text-on-primary-container">
        <style>{`
          .bracket-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
          .bracket-scroll::-webkit-scrollbar-track { background: #1c1b1b; border-radius: 4px; }
          .bracket-scroll::-webkit-scrollbar-thumb { background: #40493d; border-radius: 4px; }
          .bracket-scroll::-webkit-scrollbar-thumb:hover { background: #8a9485; }
          .connector-line { stroke: #40493d; stroke-width: 2; fill: none; }
          .connector-line.active { stroke: #2e7d32; }
          @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          .modal-animate { animation: modalFadeIn 0.2s ease-out forwards; }
        `}</style>
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative w-full">
          {/* TopAppBar (Contextual for this view) */}
          <header className="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4 w-full bg-background border-b border-outline-variant z-10 shrink-0">
            <div className="flex gap-4 flex-col items-start">
              <div className="flex items-center gap-4 mb-4">
                <Link href="/internal/contests" className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors bg-surface-container-highest px-3 py-1.5 rounded border border-outline-variant hover:border-primary">
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  <span className="font-label-sm text-label-sm">Back to Contests</span>
                </Link>
                <div className="h-6 w-px bg-outline-variant mx-2 hidden md:block"></div>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface">{contest.name}</h2>
                  <span className="bg-primary-container text-on-primary-container font-label-sm text-label-sm px-2 py-1 rounded-sm ml-2">Knockout</span>
                </div>
                <p className="text-on-surface-variant font-body-md text-sm mt-1">Contests • Round of 16 • Live</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant">
                <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Live SSE Active</span>
              </div>
              <button className="text-on-surface-variant hover:text-on-surface transition-colors p-2 rounded-full hover:bg-surface-container-low">
                <span className="material-symbols-outlined">refresh</span>
              </button>
            </div>
          </header>

          {/* Bracket Canvas */}
          <div 
            className="flex-1 overflow-auto bracket-scroll relative bg-surface-container-lowest p-8 cursor-grab active:cursor-grabbing" 
            ref={scrollRef}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onClick={closeSidebar}
          >
            {/* Live Update Notice Mobile */}
            <div className="sm:hidden absolute top-4 right-4 flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant z-10 shadow-md">
              <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
              <span className="font-label-sm text-label-sm text-on-surface-variant text-xs">Live</span>
            </div>

            {/* SVG Bracket Structure */}
            <div className="min-w-[1200px] h-[800px] relative">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                {/* Quarter Finals to Semi Finals Connectors */}
                <path className="connector-line active" d="M 280 100 L 320 100 L 320 200 L 360 200"></path>
                <path className="connector-line" d="M 280 300 L 320 300 L 320 200 L 360 200"></path>
                <path className="connector-line active" d="M 280 500 L 320 500 L 320 600 L 360 600"></path>
                <path className="connector-line" d="M 280 700 L 320 700 L 320 600 L 360 600"></path>
                {/* Semi Finals to Final Connectors */}
                <path className="connector-line active" d="M 640 200 L 680 200 L 680 400 L 720 400"></path>
                <path className="connector-line" d="M 640 600 L 680 600 L 680 400 L 720 400"></path>
              </svg>

              {/* Grid Layout for Nodes */}
              <div className="absolute inset-0 flex" style={{ zIndex: 1 }}>
                {/* Round 1 (Quarter Finals) */}
                <div className="flex flex-col justify-around w-[280px] pr-8">
                  {/* Match 1 */}
                  <div className="bg-surface-container border border-outline-variant rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer" onClick={(e) => openMatchDetails(e, 'm1')}>
                    <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Match 1</span>
                      <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider">Final</span>
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex justify-between items-center p-2 rounded bg-surface-variant border-l-2 border-primary">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center text-xs font-bold text-on-secondary-container">AL</div>
                          <span className="font-label-sm text-sm text-on-surface">AlexChen</span>
                        </div>
                        <span className="font-label-sm font-bold text-primary">300</span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded">
                        <div className="flex items-center gap-2 opacity-50">
                          <div className="w-6 h-6 rounded-full bg-surface-bright flex items-center justify-center text-xs text-on-surface-variant">SJ</div>
                          <span className="font-label-sm text-sm text-on-surface-variant">SarahJ</span>
                        </div>
                        <span className="font-label-sm text-on-surface-variant opacity-50">150</span>
                      </div>
                    </div>
                  </div>

                  {/* Match 2 */}
                  <div className="bg-surface-container border border-outline-variant rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer" onClick={(e) => openMatchDetails(e, 'm2')}>
                    <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Match 2</span>
                      <span className="font-label-sm text-[10px] bg-surface-bright text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider">Live</span>
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex justify-between items-center p-2 rounded bg-surface-variant">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-tertiary-container flex items-center justify-center text-xs font-bold text-on-tertiary-container">DP</div>
                          <span className="font-label-sm text-sm text-on-surface">DavidP</span>
                        </div>
                        <span className="font-label-sm font-bold text-on-surface">120</span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-bright flex items-center justify-center text-xs text-on-surface-variant">MK</div>
                          <span className="font-label-sm text-sm text-on-surface">MayaK</span>
                        </div>
                        <span className="font-label-sm text-on-surface">95</span>
                      </div>
                    </div>
                  </div>

                  {/* Match 3 */}
                  <div className="bg-surface-container border border-outline-variant rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer" onClick={(e) => openMatchDetails(e, 'm3')}>
                    <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Match 3</span>
                      <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider">Final</span>
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex justify-between items-center p-2 rounded bg-surface-variant border-l-2 border-primary">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center text-xs font-bold text-on-secondary-container">RK</div>
                          <span className="font-label-sm text-sm text-on-surface">RahulK</span>
                        </div>
                        <span className="font-label-sm font-bold text-primary">450</span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded">
                        <div className="flex items-center gap-2 opacity-50">
                          <div className="w-6 h-6 rounded-full bg-surface-bright flex items-center justify-center text-xs text-on-surface-variant">JL</div>
                          <span className="font-label-sm text-sm text-on-surface-variant">JaneL</span>
                        </div>
                        <span className="font-label-sm text-on-surface-variant opacity-50">400</span>
                      </div>
                    </div>
                  </div>

                  {/* Match 4 */}
                  <div className="bg-surface-container border border-outline-variant rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer" onClick={(e) => openMatchDetails(e, 'm4')}>
                    <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Match 4</span>
                      <span className="font-label-sm text-[10px] bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider border border-outline-variant">Upcoming</span>
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex justify-between items-center p-2 rounded">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-bright flex items-center justify-center text-xs text-on-surface-variant">TC</div>
                          <span className="font-label-sm text-sm text-on-surface">TomC</span>
                        </div>
                        <span className="font-label-sm text-on-surface-variant">-</span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-bright flex items-center justify-center text-xs text-on-surface-variant">ES</div>
                          <span className="font-label-sm text-sm text-on-surface">EmmaS</span>
                        </div>
                        <span className="font-label-sm text-on-surface-variant">-</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Round 2 (Semi Finals) */}
                <div className="flex flex-col justify-around w-[280px] pl-8 pr-8 ml-[80px]">
                  {/* Match 5 */}
                  <div className="bg-surface-container border border-primary rounded-lg overflow-hidden shadow-[0_0_15px_rgba(46,125,50,0.2)] cursor-pointer" onClick={(e) => openMatchDetails(e, 'm5')}>
                    <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Semi-Final 1</span>
                      <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> Live
                      </span>
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex justify-between items-center p-2 rounded bg-surface-variant border-l-2 border-primary">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center text-xs font-bold text-on-secondary-container">AL</div>
                          <span className="font-label-sm text-sm text-on-surface">AlexChen</span>
                        </div>
                        <span className="font-label-sm font-bold text-primary">210</span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded">
                        <div className="flex items-center gap-2">
                          <span className="font-label-sm text-sm text-on-surface-variant italic">TBD (Match 2 Winner)</span>
                        </div>
                        <span className="font-label-sm text-on-surface-variant">-</span>
                      </div>
                    </div>
                  </div>

                  {/* Match 6 */}
                  <div className="bg-surface-container border border-outline-variant rounded-lg overflow-hidden opacity-60 hover:opacity-100 transition-opacity cursor-pointer" onClick={(e) => openMatchDetails(e, 'm6')}>
                    <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Semi-Final 2</span>
                      <span className="font-label-sm text-[10px] bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider border border-outline-variant">Waiting</span>
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex justify-between items-center p-2 rounded">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center text-xs font-bold text-on-secondary-container">RK</div>
                          <span className="font-label-sm text-sm text-on-surface">RahulK</span>
                        </div>
                        <span className="font-label-sm text-on-surface-variant">-</span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded">
                        <div className="flex items-center gap-2">
                          <span className="font-label-sm text-sm text-on-surface-variant italic">TBD (Match 4 Winner)</span>
                        </div>
                        <span className="font-label-sm text-on-surface-variant">-</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Round 3 (Finals) */}
                <div className="flex flex-col justify-center w-[280px] pl-8 ml-[80px]">
                  {/* Match 7 (Grand Final) */}
                  <div className="bg-surface-container border-2 border-outline-variant rounded-lg overflow-hidden opacity-50 relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent to-surface-variant pointer-events-none"></div>
                    <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high relative z-10">
                      <span className="font-label-sm text-label-sm text-on-surface font-bold flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-tertiary">emoji_events</span>
                        Grand Final
                      </span>
                    </div>
                    <div className="p-4 space-y-3 relative z-10">
                      <div className="flex justify-between items-center p-3 rounded bg-surface-lowest border border-outline-variant border-dashed">
                        <span className="font-label-sm text-sm text-on-surface-variant italic">Winner SF 1</span>
                      </div>
                      <div className="flex justify-center">
                        <span className="font-label-sm text-xs text-on-surface-variant">VS</span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded bg-surface-lowest border border-outline-variant border-dashed">
                        <span className="font-label-sm text-sm text-on-surface-variant italic">Winner SF 2</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
        
        <aside 
          className="fixed top-0 right-0 h-full w-[400px] bg-surface-container-low border-l border-outline-variant z-[60] transition-transform duration-300 ease-in-out flex flex-col shadow-2xl"
          style={{ transform: sidebarOpen ? 'translateX(0)' : 'translateX(100%)' }}
        >
          <div className="flex items-center justify-between p-6 border-b border-outline-variant bg-surface-container-high">
            <div className="flex flex-col">
              <span className="font-label-sm text-xs text-primary tracking-widest uppercase">Match 1</span>
              <h3 className="font-headline-lg text-xl font-bold text-on-surface">Match Details</h3>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-surface-variant rounded-full transition-colors text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-surface-container rounded-lg border border-outline-variant">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-secondary-container flex items-center justify-center font-bold text-on-secondary-container">AL</div>
                  <span className="font-label-sm text-sm">AlexChen</span>
                  <span className="text-2xl font-bold text-primary">300</span>
                </div>
                <div className="text-on-surface-variant font-label-sm">VS</div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-surface-bright flex items-center justify-center font-bold text-on-surface-variant">SJ</div>
                  <span className="font-label-sm text-sm">SarahJ</span>
                  <span className="text-2xl font-bold">150</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-label-sm text-xs text-on-surface-variant uppercase tracking-widest mb-4 border-b border-outline-variant pb-2">Execution Log</h4>
              <div className="space-y-2 font-label-sm text-xs">
                <div className="flex justify-between p-2 bg-surface-container-lowest border-l-2 border-primary">
                  <span className="text-on-surface">Binary Tree Inversion</span>
                  <span className="text-primary">Solved 14m 32s</span>
                </div>
                <div className="flex justify-between p-2 bg-surface-container-lowest border-l-2 border-error">
                  <span className="text-on-surface">Network Flow Max</span>
                  <span className="text-error">Failed (TLE)</span>
                </div>
                <div className="flex justify-between p-2 bg-surface-container-lowest border-l-2 border-outline-variant opacity-50">
                  <span className="text-on-surface">Quantum Logic</span>
                  <span className="text-on-surface-variant">Pending</span>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-outline-variant bg-surface-container-high flex flex-col gap-3">
            <button className="w-full py-3 bg-primary text-on-primary font-label-sm rounded font-bold hover:opacity-90 transition-opacity">ENTER ROOM</button>
            <button className="w-full py-3 border border-outline-variant text-on-surface font-label-sm rounded hover:bg-surface-variant transition-colors">SPECTATE</button>
          </div>
        </aside>

      </div>
    </>
  );
}
