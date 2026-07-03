import fs from "fs";
import path from "path";

const content = `"use client";

import Link from "next/link";
import { ContestListingItem } from "@/lib/actions/contests";
import "@/styles/stitch.css";
import { useState, useMemo } from "react";
import { BracketSnapshot, BracketNode } from "@/types/bracket";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  Node,
  Edge,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Simple helper to get team initials
function getInitials(name: string) {
  if (!name) return "??";
  return name.substring(0, 2).toUpperCase();
}

// Custom Node for React Flow
function MatchCardNode({ data }: { data: any }) {
  const { node, openMatchDetails } = data;
  const team1 = node.teams[0];
  const team2 = node.teams[1];
  
  const isBye = node.status === "bye";
  const isCompleted = node.status === "completed";
  const isActive = node.status === "active";
  
  const getBadge = () => {
    if (isCompleted) return <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider">Final</span>;
    if (isActive) return <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> Live</span>;
    if (isBye) return <span className="font-label-sm text-[10px] bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider border border-outline-variant">Bye</span>;
    return <span className="font-label-sm text-[10px] bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider border border-outline-variant">Waiting</span>;
  };

  const getTeamRow = (teamId: string | null, score: number, isWinner: boolean, opacityClass: string) => {
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
    
    const teamName = \`Team \${teamId.slice(-4)}\`;
    const initials = getInitials(teamName);
    
    return (
      <div className={\`flex justify-between items-center p-2 rounded \${isWinner ? 'bg-surface-variant border-l-2 border-primary' : opacityClass}\`}>
        <div className="flex items-center gap-2">
          <div className={\`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold \${isWinner ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-bright text-on-surface-variant'}\`}>
            {initials}
          </div>
          <span className={\`font-label-sm text-sm \${isWinner ? 'text-on-surface' : 'text-on-surface-variant'}\`}>{teamName}</span>
        </div>
        <span className={\`font-label-sm \${isWinner ? 'font-bold text-primary' : 'text-on-surface-variant opacity-50'}\`}>{score}</span>
      </div>
    );
  };

  const winnerId = node.winner;
  const isPending = !isCompleted && !isActive;

  let containerStyle = "bg-surface-container border border-outline-variant rounded-lg overflow-hidden hover:border-primary transition-colors cursor-pointer w-[260px]";
  if (isActive) {
    containerStyle = "bg-surface-container border border-primary rounded-lg overflow-hidden shadow-[0_0_15px_rgba(46,125,50,0.2)] cursor-pointer w-[260px]";
  } else if (isPending) {
    containerStyle = "bg-surface-container border border-outline-variant rounded-lg overflow-hidden opacity-60 hover:opacity-100 transition-opacity cursor-pointer w-[260px]";
  }
  
  return (
    <div 
      className={containerStyle}
      onClick={(e) => openMatchDetails(e, node.roomId)}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#555' }} />
      <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high">
        <span className="font-label-sm text-label-sm text-on-surface-variant">Match {node.matchIndex + 1}</span>
        {getBadge()}
      </div>
      <div className="p-2 space-y-1">
        {getTeamRow(team1, node.scores[0], team1 !== null && team1 === winnerId, team1 === null || team1 !== winnerId ? 'opacity-50' : '')}
        {getTeamRow(team2, node.scores[1], team2 !== null && team2 === winnerId, team2 === null || team2 !== winnerId ? 'opacity-50' : '')}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#555' }} />
    </div>
  );
}

const nodeTypes = {
  matchNode: MatchCardNode,
};

export default function BracketRoomClient({ contest, initialSnapshot }: { contest: ContestListingItem, initialSnapshot: BracketSnapshot }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);

  const openMatchDetails = (e: React.MouseEvent, matchId: string) => {
    e.stopPropagation();
    setSelectedMatch(matchId);
  };

  const closeSidebar = () => {
    setSelectedMatch(null);
    setSidebarOpen(false);
  };

  // Convert initialSnapshot into React Flow Nodes and Edges
  const { nodes, edges } = useMemo(() => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    
    // Group nodes by round
    const rounds: BracketNode[][] = Array.from({ length: initialSnapshot.totalRounds }, () => []);
    initialSnapshot.nodes.forEach(node => {
      if (node.roundNumber >= 1 && node.roundNumber <= initialSnapshot.totalRounds) {
        rounds[node.roundNumber - 1].push(node);
      }
    });

    const NODE_WIDTH = 260;
    const NODE_HEIGHT = 120;
    const X_OFFSET = 350;
    const Y_OFFSET = 160;

    // Calculate Y positions based on perfect binary tree math
    for (let r = 0; r < initialSnapshot.totalRounds; r++) {
      const currentRoundNodes = rounds[r];
      
      currentRoundNodes.forEach((node, i) => {
        // Tree scaling factor
        const scale = Math.pow(2, r);
        
        // Calculate X
        const xPos = r * X_OFFSET;
        
        // Calculate Y so children are centered on parents
        // Base starting y depends on the round
        const startY = ((scale - 1) * Y_OFFSET) / 2;
        const yPos = startY + (i * scale * Y_OFFSET);

        flowNodes.push({
          id: node.roomId,
          type: 'matchNode',
          position: { x: xPos, y: yPos },
          data: { node, openMatchDetails }
        });

        // Add edge to parent (if not the last round)
        if (r < initialSnapshot.totalRounds - 1) {
          const parentIndex = Math.floor(i / 2);
          const parentNode = rounds[r + 1][parentIndex];
          if (parentNode) {
            const isActiveEdge = node.status === "completed" && node.winner !== null;
            flowEdges.push({
              id: \`edge-\${node.roomId}-\${parentNode.roomId}\`,
              source: node.roomId,
              target: parentNode.roomId,
              type: 'step',
              animated: isActiveEdge,
              style: { stroke: isActiveEdge ? '#2e7d32' : '#40493d', strokeWidth: 2 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: isActiveEdge ? '#2e7d32' : '#40493d',
              },
            });
          }
        }
      });
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [initialSnapshot]);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hanken+Grotesk:wght@600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <div className="fixed inset-0 top-[64px] dark stitch-container bg-background text-on-surface font-body-md selection:bg-primary-container selection:text-on-primary-container z-0 flex flex-col">
        
        {/* Main Header Area (Kept Intact) */}
        <header className="flex-none h-[80px] flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4 bg-background border-b border-outline-variant z-10 w-full">
          <div className="flex gap-4 flex-col items-start w-full">
            <div className="flex items-center gap-4">
              <Link href="/internal/contests" className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors bg-surface-container-highest px-3 py-1.5 rounded border border-outline-variant hover:border-primary">
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                <span className="font-label-sm text-label-sm">Back to Contests</span>
              </Link>
              <div className="h-6 w-px bg-outline-variant mx-2 hidden md:block"></div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface leading-none">{contest.name}</h2>
                <span className="bg-primary-container text-on-primary-container font-label-sm text-label-sm px-2 py-1 rounded-sm ml-2 leading-none">Knockout</span>
              </div>
            </div>
          </div>
        </header>

        {/* React Flow Canvas */}
        <div className="flex-1 w-full relative" onClick={closeSidebar}>
          <ReactFlow 
            nodes={nodes} 
            edges={edges} 
            nodeTypes={nodeTypes}
            fitView 
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            className="bg-surface-container-lowest"
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#333" gap={16} />
            <Controls className="!bg-surface-container !border-outline-variant !text-on-surface" />
          </ReactFlow>
        </div>
      </div>
    </>
  );
}
`;

fs.writeFileSync(path.resolve("src/lib/components/BracketRoomClient.tsx"), content);
console.log("Updated BracketRoomClient.tsx with React Flow!");
