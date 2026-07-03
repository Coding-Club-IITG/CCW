import fs from "fs";
import path from "path";

const content = `"use client";

import Link from "next/link";
import { ContestListingItem } from "@/lib/actions/contests";
import "@/styles/stitch.css";
import { useRef, useState, useEffect } from "react";
import { BracketSnapshot, BracketNode } from "@/types/bracket";

// Simple helper to get team initials
function getInitials(name: string) {
  if (!name) return "??";
  return name.substring(0, 2).toUpperCase();
}

function MatchCard({ node, openMatchDetails }: { node: BracketNode, openMatchDetails: (e: React.MouseEvent, id: string) => void }) {
  // node.teams has team IDs. For a real app, we would resolve team names from a map.
  // For now we'll just display the IDs or 'TBD'
  const team1 = node.teams[0];
  const team2 = node.teams[1];
  
  const isBye = node.status === "bye";
  const isCompleted = node.status === "completed";
  const isActive = node.status === "active";
  
  const getBadge = () => {
    if (isCompleted) return <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider">Final</span>;
    if (isActive) return <span className="font-label-sm text-[10px] bg-surface-bright text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider">Live</span>;
    if (isBye) return <span className="font-label-sm text-[10px] bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider border border-outline-variant">Bye</span>;
    return <span className="font-label-sm text-[10px] bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider border border-outline-variant">Waiting</span>;
  };

  const getTeamRow = (teamId: string | null, score: number, isWinner: boolean) => {
    if (!teamId) {
      return (
        <div className="flex justify-between items-center p-2 rounded">
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-sm text-on-surface-variant italic">TBD</span>
          </div>
          <span className="font-label-sm text-on-surface-variant">-</span>
        </div>
      );
    }
    
    // In a full implementation, we'd look up team details from a map passed down.
    // For this step, we just use the teamId string slice as a placeholder name since the focus is on the schema rendering.
    const teamName = \`Team \${teamId.slice(-4)}\`;
    const initials = getInitials(teamName);
    
    return (
      <div className={\`flex justify-between items-center p-2 rounded \${isWinner ? 'bg-surface-variant border-l-2 border-primary' : 'opacity-70'}\`}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-surface-bright flex items-center justify-center text-xs text-on-surface-variant">{initials}</div>
          <span className="font-label-sm text-sm text-on-surface">{teamName}</span>
        </div>
        <span className={\`font-label-sm \${isWinner ? 'font-bold text-primary' : 'text-on-surface'}\`}>{score}</span>
      </div>
    );
  };

  const winnerId = node.winner;
  
  return (
    <div 
      id={\`node-\${node.roomId}\`}
      className={\`bg-surface-container border \${isActive ? 'border-primary shadow-[0_0_15px_rgba(46,125,50,0.2)]' : 'border-outline-variant'} rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer w-[240px] z-10 shrink-0\`}
      onClick={(e) => openMatchDetails(e, node.roomId)}
    >
      <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high">
        <span className="font-label-sm text-label-sm text-on-surface-variant">Match {node.matchIndex + 1}</span>
        {getBadge()}
      </div>
      <div className="p-2 space-y-1">
        {getTeamRow(team1, node.scores[0], team1 !== null && team1 === winnerId)}
        {getTeamRow(team2, node.scores[1], team2 !== null && team2 === winnerId)}
      </div>
    </div>
  );
}

export default function BracketRoomClient({ contest, initialSnapshot }: { contest: ContestListingItem, initialSnapshot: BracketSnapshot }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);

  // Group nodes by round
  const rounds: BracketNode[][] = Array.from({ length: initialSnapshot.totalRounds }, () => []);
  initialSnapshot.nodes.forEach(node => {
    if (node.roundNumber >= 1 && node.roundNumber <= initialSnapshot.totalRounds) {
      rounds[node.roundNumber - 1].push(node);
    }
  });

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
    // setSidebarOpen(true); // Hidden for now as requested
  };

  const closeSidebar = () => {
    setSelectedMatch(null);
    setSidebarOpen(false);
  };
  
  // Logic to draw SVG lines between nodes
  const [svgLines, setSvgLines] = useState<JSX.Element[]>([]);
  
  useEffect(() => {
    const drawLines = () => {
      const newLines: JSX.Element[] = [];
      const canvasRect = scrollRef.current?.getBoundingClientRect();
      if (!canvasRect) return;
      
      const scrollOffsetX = scrollRef.current.scrollLeft;
      const scrollOffsetY = scrollRef.current.scrollTop;

      // Iterate through rounds to connect to the NEXT round
      for (let r = 0; r < initialSnapshot.totalRounds - 1; r++) {
        const currentRoundNodes = rounds[r];
        const nextRoundNodes = rounds[r + 1];
        
        currentRoundNodes.forEach((node, i) => {
          // A node at index i connects to next round node at index Math.floor(i / 2)
          const parentIndex = Math.floor(i / 2);
          const parentNode = nextRoundNodes[parentIndex];
          if (!parentNode) return;
          
          const el1 = document.getElementById(\`node-\${node.roomId}\`);
          const el2 = document.getElementById(\`node-\${parentNode.roomId}\`);
          
          if (el1 && el2) {
            const rect1 = el1.getBoundingClientRect();
            const rect2 = el2.getBoundingClientRect();
            
            // Calculate center right of child
            const x1 = rect1.right - canvasRect.left + scrollOffsetX;
            const y1 = rect1.top + (rect1.height / 2) - canvasRect.top + scrollOffsetY;
            
            // Calculate center left of parent
            const x2 = rect2.left - canvasRect.left + scrollOffsetX;
            const y2 = rect2.top + (rect2.height / 2) - canvasRect.top + scrollOffsetY;
            
            // Draw angular path
            const midX = (x1 + x2) / 2;
            const path = \`M \${x1} \${y1} L \${midX} \${y1} L \${midX} \${y2} L \${x2} \${y2}\`;
            
            const isActive = node.status === "completed" && node.winner !== null;
            
            newLines.push(
              <path key={\`line-\${node.roomId}\`} d={path} className={\`connector-line \${isActive ? 'active' : ''}\`} />
            );
          }
        });
      }
      setSvgLines(newLines);
    };
    
    // Slight delay to ensure DOM is rendered before measuring
    setTimeout(drawLines, 100);
    
    window.addEventListener("resize", drawLines);
    return () => window.removeEventListener("resize", drawLines);
  }, [initialSnapshot]);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hanken+Grotesk:wght@600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <div className="flex-1 flex flex-col overflow-hidden relative dark stitch-container bg-background w-full h-full text-on-surface font-body-md selection:bg-primary-container selection:text-on-primary-container">
        <style>{\`
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
        \`}</style>
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative w-full">
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
                <p className="text-on-surface-variant font-body-md text-sm mt-1">Live Bracket Visualization</p>
              </div>
            </div>
          </header>

          <div 
            className="flex-1 overflow-auto bracket-scroll relative bg-surface-container-lowest p-16 cursor-grab active:cursor-grabbing" 
            ref={scrollRef}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onClick={closeSidebar}
          >
            <div className="min-w-max min-h-max relative flex items-stretch gap-[100px]">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0, minWidth: '100%', minHeight: '100%' }}>
                {svgLines}
              </svg>

              {rounds.map((roundNodes, rIndex) => (
                <div key={\`round-\${rIndex}\`} className="flex flex-col justify-around gap-[40px] relative z-10">
                  {roundNodes.map((node) => (
                    <MatchCard key={node.roomId} node={node} openMatchDetails={openMatchDetails} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </main>
        
        {/* Sidebar Hidden as requested */}
        {sidebarOpen && (
          <aside className="fixed top-0 right-0 h-full w-[400px] bg-surface-container-low border-l border-outline-variant z-[60] hidden">
          </aside>
        )}

      </div>
    </>
  );
}
`;

fs.writeFileSync(path.resolve("src/lib/components/BracketRoomClient.tsx"), content);
console.log("Updated BracketRoomClient.tsx");
