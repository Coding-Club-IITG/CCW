"use client";

import Link from "next/link";
import { ContestListingItem } from "@/lib/actions/contests";
import "@/styles/stitch.css";
import { useEffect, useRef, useState } from "react";
import { BracketSnapshot, BracketNode, getRoundName } from "@/types/bracket";
import { useRouter } from "next/navigation";

export default function BracketRoomClient({ contest }: { contest: ContestListingItem }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<BracketNode | null>(null);

  const [snapshot, setSnapshot] = useState<BracketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch initial bracket
  useEffect(() => {
    fetch(`/api/contests/${contest._id}/bracket/generate`)
      .then(r => r.json())
      .then(data => {
        if (data.bracket) {
          setSnapshot(data.bracket);
        } else {
          setSnapshot(data);
        }
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, [contest._id]);

  // Subscribe to SSE
  useEffect(() => {
    const eventSource = new EventSource(`/api/events`);
    
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.payload && data.payload.type === "contest.bracket_update") {
          setSnapshot(data.payload as BracketSnapshot);
          if (selectedMatch) {
            const updatedMatch = data.payload.nodes.find((n: BracketNode) => n.roomId === selectedMatch.roomId);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }
        }
      } catch (err) {}
    };

    return () => eventSource.close();
  }, [selectedMatch]);

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

  const openMatchDetails = (match: BracketNode) => {
    setSelectedMatch(match);
    setSidebarOpen(true);
  };

  if (loading || !snapshot) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const { totalRounds, nodes, teamsMap = {} } = snapshot;

  const matchWidth = 280;
  const matchHeight = 110;
  const colGap = 80;
  const rowGap = 40;

  // Calculate positions for nodes
  const nodePositions = new Map<string, { x: number, y: number }>();
  
  // First, map nodes by round and matchIndex
  const nodesByRound: Record<number, BracketNode[]> = {};
  for (let r = 1; r <= totalRounds; r++) {
    nodesByRound[r] = [];
  }
  nodes.forEach(n => {
    if (nodesByRound[n.roundNumber]) {
      nodesByRound[n.roundNumber].push(n);
    }
  });

  // Sort nodes in each round by matchIndex
  for (let r = 1; r <= totalRounds; r++) {
    nodesByRound[r].sort((a, b) => a.matchIndex - b.matchIndex);
  }

  // Calculate Y positions bottom-up or top-down
  // Round 1 Y positions:
  const round1Count = Math.pow(2, totalRounds - 1);
  for (let i = 0; i < round1Count; i++) {
    const node = nodesByRound[1].find(n => n.matchIndex === i);
    const x = 0;
    const y = i * (matchHeight + rowGap);
    if (node) nodePositions.set(node.roomId, { x, y });
  }

  // Calculate subsequent rounds
  for (let r = 2; r <= totalRounds; r++) {
    const prevRoundNodes = nodesByRound[r - 1];
    const matchCount = Math.pow(2, totalRounds - r);
    for (let i = 0; i < matchCount; i++) {
      const node = nodesByRound[r].find(n => n.matchIndex === i);
      const x = (r - 1) * (matchWidth + colGap);
      
      const child1 = prevRoundNodes.find(n => n.matchIndex === i * 2);
      const child2 = prevRoundNodes.find(n => n.matchIndex === i * 2 + 1);
      
      let y = 0;
      if (child1 && child2 && nodePositions.has(child1.roomId) && nodePositions.has(child2.roomId)) {
        y = (nodePositions.get(child1.roomId)!.y + nodePositions.get(child2.roomId)!.y) / 2;
      } else if (child1 && nodePositions.has(child1.roomId)) {
        y = nodePositions.get(child1.roomId)!.y; // Bypass
      }
      
      if (node) nodePositions.set(node.roomId, { x, y });
    }
  }

  const canvasWidth = totalRounds * matchWidth + (totalRounds - 1) * colGap + 200;
  const canvasHeight = round1Count * (matchHeight + rowGap) + 100;

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
          <header className="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4 w-full bg-background border-b border-outline-variant z-10 shrink-0">
            <div className="flex gap-4 flex-col items-start">
              <div className="flex items-center gap-4 mb-4">
                <Link href="/internal/contests" className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors bg-surface-container-highest px-3 py-1.5 rounded border border-outline-variant hover:border-primary">
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  <span className="font-label-sm text-label-sm">Back to Contests</span>
                </Link>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface">{contest.name}</h2>
                  <span className="bg-primary-container text-on-primary-container font-label-sm text-label-sm px-2 py-1 rounded-sm ml-2">Knockout</span>
                </div>
                <p className="text-on-surface-variant font-body-md text-sm mt-1">Status: {snapshot.status}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant">
                <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Live SSE Active</span>
              </div>
            </div>
          </header>

          <div 
            className="flex-1 overflow-auto bracket-scroll relative bg-surface-container-lowest p-8 cursor-grab active:cursor-grabbing" 
            ref={scrollRef}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
          >
            <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
              {/* Draw SVG Connectors */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                {nodes.map(node => {
                  const pos = nodePositions.get(node.roomId);
                  if (!pos || node.roundNumber === totalRounds) return null;
                  
                  const nextRoundNode = nodesByRound[node.roundNumber + 1]?.find(n => n.matchIndex === Math.floor(node.matchIndex / 2));
                  const nextPos = nextRoundNode ? nodePositions.get(nextRoundNode.roomId) : null;
                  
                  if (!nextPos) return null;

                  const startX = pos.x + matchWidth;
                  const startY = pos.y + matchHeight / 2;
                  const endX = nextPos.x;
                  const endY = nextPos.y + matchHeight / 2;
                  const midX = startX + colGap / 2;

                  const isActive = node.status === 'completed' && nextRoundNode.status !== 'completed';

                  return (
                    <path 
                      key={`path-${node.roomId}`}
                      className={`connector-line ${isActive ? 'active' : ''}`} 
                      d={`M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`} 
                    />
                  );
                })}
              </svg>

              {/* Draw Match Nodes */}
              {nodes.map(node => {
                const pos = nodePositions.get(node.roomId);
                if (!pos) return null;

                const team1Name = node.teams[0] ? (teamsMap[node.teams[0]]?.name || "Unknown") : "TBD";
                const team2Name = node.teams[1] ? (teamsMap[node.teams[1]]?.name || "Unknown") : "TBD";
                const isBye = node.status === 'bye';

                return (
                  <div 
                    key={node.roomId}
                    className="absolute bg-surface-container border border-outline-variant rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer"
                    style={{ left: pos.x, top: pos.y, width: matchWidth, height: matchHeight, zIndex: 1 }}
                    onClick={() => openMatchDetails(node)}
                  >
                    <div className="flex justify-between items-center px-3 py-1.5 border-b border-outline-variant bg-surface-container-high">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Match {node.matchIndex + 1}</span>
                      <span className={`font-label-sm text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${node.status === 'active' ? 'bg-error text-on-error' : 'bg-surface-bright text-on-surface-variant'}`}>
                        {node.status}
                      </span>
                    </div>
                    <div className="p-2 space-y-1">
                      <div className={`flex justify-between items-center p-1.5 rounded ${node.winner === node.teams[0] ? 'bg-surface-variant border-l-2 border-primary' : ''}`}>
                        <span className="font-label-sm text-sm text-on-surface truncate pr-2">{team1Name}</span>
                        {!isBye && <span className={`font-label-sm font-bold ${node.winner === node.teams[0] ? 'text-primary' : 'text-on-surface'}`}>{node.scores[0]}</span>}
                      </div>
                      <div className={`flex justify-between items-center p-1.5 rounded ${node.winner === node.teams[1] ? 'bg-surface-variant border-l-2 border-primary' : ''}`}>
                        <span className="font-label-sm text-sm text-on-surface truncate pr-2">{team2Name}</span>
                        {!isBye && <span className={`font-label-sm font-bold ${node.winner === node.teams[1] ? 'text-primary' : 'text-on-surface'}`}>{node.scores[1]}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* Right Sidebar - Match Details */}
        {sidebarOpen && selectedMatch && (
          <aside className="w-[320px] md:w-[380px] bg-surface-container-low border-l border-outline-variant h-full absolute right-0 top-0 z-20 flex flex-col shadow-2xl modal-animate shrink-0">
            <div className="flex justify-between items-center p-4 border-b border-outline-variant bg-surface-container">
              <div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Match {selectedMatch.matchIndex + 1}</h3>
                <p className="font-label-sm text-label-sm text-on-surface-variant">{getRoundName(selectedMatch.roundNumber, totalRounds)}</p>
              </div>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="text-on-surface-variant hover:text-on-surface transition-colors p-2 rounded-full hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              {/* Versus Display */}
              <div className="flex flex-col items-center gap-4 py-6 bg-surface-container rounded-xl border border-outline-variant mb-6 relative overflow-hidden">
                <div className="text-center z-10 w-full px-4">
                  <p className="font-label-lg text-lg text-on-surface font-bold truncate">
                    {selectedMatch.teams[0] ? (teamsMap[selectedMatch.teams[0]]?.name || "Unknown") : "TBD"}
                  </p>
                  <p className="font-headline-lg text-primary mt-1">{selectedMatch.scores[0]}</p>
                </div>
                
                <div className="bg-surface-container-high px-4 py-1 rounded-full border border-outline-variant z-10">
                  <span className="font-label-sm font-bold text-on-surface-variant">VS</span>
                </div>
                
                <div className="text-center z-10 w-full px-4">
                  <p className="font-headline-lg text-secondary mb-1">{selectedMatch.scores[1]}</p>
                  <p className="font-label-lg text-lg text-on-surface font-bold truncate">
                    {selectedMatch.teams[1] ? (teamsMap[selectedMatch.teams[1]]?.name || "Unknown") : "TBD"}
                  </p>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <button 
                  onClick={() => router.push(`/internal/contests/rooms/${selectedMatch.roomId}`)}
                  className="w-full py-3 bg-primary hover:bg-primary/90 text-on-primary rounded-lg font-label-md text-label-md transition-colors font-bold uppercase tracking-wide flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">login</span>
                  ENTER ROOM
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
