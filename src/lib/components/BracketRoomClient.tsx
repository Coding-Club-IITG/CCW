"use client";

import Link from "next/link";
import { ContestListingItem } from "@/lib/actions/contests";
import "@/styles/stitch.css";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { BracketSnapshot, BracketNode, getRoundName } from "@/types/bracket";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ── Helpers ───────────────────────────────────────────────────────
function getInitials(name: string) {
  if (!name) return "??";
  const parts = name.split(/[\s_-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

// ── Grand Final Node ──────────────────────────────────────────────
function GrandFinalNode({ data }: { data: any }) {
  const { node, openMatchDetails } = data;
  const [isHovered, setIsHovered] = useState(false);
  const t1 = node.teams[0], t2 = node.teams[1];
  const n1 = node.teamNames?.[0], n2 = node.teamNames?.[1];
  const isCompleted = node.status === "completed";
  const isActive = node.status === "active";

  const slot = (tid: string | null, tname: string | null, fallback: string) => {
    if (tid && tname) {
      return (
        <div className="flex justify-between items-center p-3 rounded bg-surface-container-lowest border border-outline-variant">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center text-xs font-bold text-on-secondary-container">{getInitials(tname)}</div>
            <span className="font-label-sm text-sm text-on-surface">{tname}</span>
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-between items-center p-3 rounded bg-surface-container-lowest border border-outline-variant border-dashed">
        <span className="font-label-sm text-sm text-on-surface-variant italic">{fallback}</span>
      </div>
    );
  };

  return (
    <div
      className={`bg-surface-container border-2 rounded-lg overflow-hidden relative w-[280px] cursor-pointer ${!t1 && !t2 ? 'opacity-50' : ''} ${isHovered ? 'border-primary' : 'border-outline-variant'}`}
      onClick={(e) => { e.stopPropagation(); if (openMatchDetails) openMatchDetails(e, node); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ transition: 'all 0.2s ease-in-out' }}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-px !h-px !border-none !bg-transparent" />
      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-surface-variant pointer-events-none" />
      <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high relative z-10">
        <span className="font-label-sm text-label-sm text-on-surface font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-tertiary">emoji_events</span>
          Grand Final
        </span>
        {isCompleted
          ? <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider">Final</span>
          : isActive
            ? <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Live</span>
            : <span className="font-label-sm text-[10px] bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider border border-outline-variant">Waiting</span>
        }
      </div>
      <div className="p-4 space-y-3 relative z-10">
        {slot(t1, n1, "Winner SF 1")}
        <div className="flex justify-center"><span className="font-label-sm text-xs text-on-surface-variant">VS</span></div>
        {slot(t2, n2, "Winner SF 2")}
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-px !h-px !border-none !bg-transparent" />
    </div>
  );
}

// ── Standard Match Card ───────────────────────────────────────────
function MatchCardNode({ data }: { data: any }) {
  const { node, openMatchDetails, totalRounds } = data;
  const [isHovered, setIsHovered] = useState(false);
  const t1 = node.teams[0], t2 = node.teams[1];
  const n1 = node.teamNames?.[0], n2 = node.teamNames?.[1];

  const isBye = node.status === "bye";
  const isCompleted = node.status === "completed";
  const isActive = node.status === "active";
  const isPending = !isCompleted && !isActive && !isBye;

  const roundName = getRoundName(node.roundNumber, totalRounds);
  const matchLabel = `${roundName === "Final" || roundName.startsWith("Semi") ? roundName.replace("s", "") : roundName} ${node.matchIndex + 1}`;

  const winnerId = node.winner;
  const t1Win = isCompleted && t1 && t1 === winnerId;
  const t2Win = isCompleted && t2 && t2 === winnerId;
  const t1Lose = isCompleted && t1 && t1 !== winnerId;
  const t2Lose = isCompleted && t2 && t2 !== winnerId;

  const badge = isCompleted
    ? <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider">Final</span>
    : isActive
      ? <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Live</span>
      : isBye
        ? <span className="font-label-sm text-[10px] bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider border border-outline-variant">Bye</span>
        : <span className="font-label-sm text-[10px] bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded uppercase tracking-wider border border-outline-variant">Upcoming</span>;

  const teamRow = (tid: string | null, tname: string | null, score: number, isWinner: boolean, isLoser: boolean) => {
    if (!tid || !tname) {
      return (
        <div className="flex justify-between items-center p-2 rounded">
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-sm text-on-surface-variant italic">TBD</span>
          </div>
          <span className="font-label-sm text-on-surface-variant">-</span>
        </div>
      );
    }
    const ini = getInitials(tname);
    if (isWinner) {
      return (
        <div className="flex justify-between items-center p-2 rounded bg-surface-variant border-l-2 border-primary">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center text-xs font-bold text-on-secondary-container">{ini}</div>
            <span className="font-label-sm text-sm text-on-surface">{tname}</span>
          </div>
          <span className="font-label-sm font-bold text-primary">{score}</span>
        </div>
      );
    }
    if (isLoser) {
      return (
        <div className="flex justify-between items-center p-2 rounded">
          <div className="flex items-center gap-2 opacity-50">
            <div className="w-6 h-6 rounded-full bg-surface-bright flex items-center justify-center text-xs text-on-surface-variant">{ini}</div>
            <span className="font-label-sm text-sm text-on-surface-variant">{tname}</span>
          </div>
          <span className="font-label-sm text-on-surface-variant opacity-50">{score}</span>
        </div>
      );
    }
    if (isActive) {
      return (
        <div className="flex justify-between items-center p-2 rounded bg-surface-variant">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center text-xs font-bold text-on-secondary-container">{ini}</div>
            <span className="font-label-sm text-sm text-on-surface">{tname}</span>
          </div>
          <span className="font-label-sm font-bold text-on-surface">{score}</span>
        </div>
      );
    }
    return (
      <div className="flex justify-between items-center p-2 rounded">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-surface-bright flex items-center justify-center text-xs text-on-surface-variant">{ini}</div>
          <span className="font-label-sm text-sm text-on-surface">{tname}</span>
        </div>
        <span className="font-label-sm text-on-surface-variant">{score === 0 ? '-' : score}</span>
      </div>
    );
  };

  let containerClass = "bg-surface-container border rounded-lg overflow-hidden cursor-pointer w-[280px]";
  
  if (isActive) {
    containerClass += " border-primary shadow-[0_0_15px_rgba(46,125,50,0.2)]";
  } else if (isCompleted) {
    containerClass += ` ${isHovered ? 'border-primary' : 'border-outline-variant'}`;
  } else if (isPending) {
    containerClass += ` ${isHovered ? 'opacity-100 border-outline-variant' : 'opacity-60 border-outline-variant'}`;
  } else {
    containerClass += ` ${isHovered ? 'border-primary' : 'border-outline-variant'}`;
  }

  return (
    <div 
      className={containerClass} 
      onClick={(e) => { e.stopPropagation(); if (openMatchDetails) openMatchDetails(e, node); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ transition: 'all 0.2s ease-in-out' }}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-px !h-px !border-none !bg-transparent" />
      <div className="flex justify-between items-center p-3 border-b border-outline-variant bg-surface-container-high">
        <span className="font-label-sm text-label-sm text-on-surface-variant">{matchLabel}</span>
        {badge}
      </div>
      <div className="p-2 space-y-1">
        {teamRow(t1, n1, node.scores[0], t1Win, t1Lose)}
        {teamRow(t2, n2, node.scores[1], t2Win, t2Lose)}
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-px !h-px !border-none !bg-transparent" />
    </div>
  );
}

const nodeTypes = { matchNode: MatchCardNode, grandFinalNode: GrandFinalNode };

// ── Match Detail Side Panel ────────────────────────────────────────
function MatchSidePanel({
  node,
  totalRounds,
  onClose,
  contestId,
}: {
  node: BracketNode | null;
  totalRounds: number;
  onClose: () => void;
  contestId: string;
}) {
  const router = useRouter();
  const [prevNode, setPrevNode] = useState<BracketNode | null>(node);
  const [displayNode, setDisplayNode] = useState<BracketNode | null>(node);

  if (node !== prevNode) {
    setPrevNode(node);
    if (node !== null) {
      setDisplayNode(node);
    }
  }

  const handleEnterRoom = () => {
    if (!displayNode?.roomId) return;
    // Navigate to contest page with the specific matchRoomId so it renders the match client
    router.push(`/internal/contests/${contestId}?matchRoomId=${displayNode.roomId}`);
  };

  const handleSpectate = () => {
    if (!displayNode?.roomId) return;
    router.push(`/internal/contests/${contestId}?matchRoomId=${displayNode.roomId}&spectate=true`);
  };

  const t1 = displayNode?.teams[0], t2 = displayNode?.teams[1];
  const n1 = displayNode?.teamNames?.[0], n2 = displayNode?.teamNames?.[1];
  const s1 = displayNode?.scores[0] ?? 0, s2 = displayNode?.scores[1] ?? 0;
  const isCompleted = displayNode?.status === "completed";
  const isActive = displayNode?.status === "active";
  const isPending = displayNode?.status === "pending";
  const roundName = displayNode ? getRoundName(displayNode.roundNumber, totalRounds) : "";
  const matchLabel = displayNode ? `${roundName.includes("Final") ? roundName : roundName} ${displayNode.matchIndex + 1}` : "";
  const winnerId = displayNode?.winner;

  const isOpen = node !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: '64px',
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 9998,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        onClick={onClose}
        aria-hidden
      />

      {/* Sidebar */}
      <aside
        className="fixed right-0 bg-surface-container-low border-l border-outline-variant flex flex-col shadow-2xl"
        style={{
          top: '64px',
          zIndex: 9999,
          height: 'calc(100vh - 64px)',
          width: '400px',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant bg-surface-container-high shrink-0">
          <div className="flex flex-col">
            <span className="font-label-sm text-xs text-primary tracking-widest uppercase">{matchLabel}</span>
            <h3 className="font-headline-lg text-xl font-bold text-on-surface">Match Details</h3>
            <p className="font-label-sm text-xs text-on-surface-variant mt-0.5">
              {isActive ? '🔴 Live' : isCompleted ? '✅ Completed' : '⏳ Upcoming'}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-2 hover:bg-surface-variant rounded-full transition-colors text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Sidebar Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Score Overview */}
          <div className="flex items-center justify-between p-4 bg-surface-container rounded-lg border border-outline-variant">
            {/* Team 1 */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border-2 ${t1 && winnerId && t1 === winnerId ? 'bg-secondary-container text-on-secondary-container border-primary' : 'bg-surface-bright text-on-surface-variant border-transparent'}`}>
                {n1 ? getInitials(n1) : "??"}
              </div>
              <span className="font-label-sm text-sm text-on-surface">{n1 || "TBD"}</span>
              <span className={`font-label-sm text-2xl font-bold ${t1 && winnerId && t1 === winnerId ? 'text-primary' : 'text-on-surface'}`}>{t1 ? s1 : '-'}</span>
              {t1 && winnerId && t1 === winnerId && (
                <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider">Winner</span>
              )}
            </div>

            {/* VS */}
            <div className="flex flex-col items-center gap-1 px-4">
              <span className="text-on-surface-variant font-label-sm text-sm">VS</span>
              {isActive && (
                <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
              )}
            </div>

            {/* Team 2 */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border-2 ${t2 && winnerId && t2 === winnerId ? 'bg-secondary-container text-on-secondary-container border-primary' : 'bg-surface-bright text-on-surface-variant border-transparent'}`}>
                {n2 ? getInitials(n2) : "??"}
              </div>
              <span className="font-label-sm text-sm text-on-surface">{n2 || "TBD"}</span>
              <span className={`font-label-sm text-2xl font-bold ${t2 && winnerId && t2 === winnerId ? 'text-primary' : 'text-on-surface'}`}>{t2 ? s2 : '-'}</span>
              {t2 && winnerId && t2 === winnerId && (
                <span className="font-label-sm text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 rounded uppercase tracking-wider">Winner</span>
              )}
            </div>
          </div>

          {/* Match Info */}
          <div>
            <h4 className="font-label-sm text-xs text-on-surface-variant uppercase tracking-widest mb-3 border-b border-outline-variant pb-2">Match Info</h4>
            <div className="space-y-2 font-label-sm text-xs">
              <div className="flex justify-between p-2 bg-surface-container-lowest border-l-2 border-outline-variant">
                <span className="text-on-surface-variant">Round</span>
                <span className="text-on-surface">{roundName}</span>
              </div>
              <div className="flex justify-between p-2 bg-surface-container-lowest border-l-2 border-outline-variant">
                <span className="text-on-surface-variant">Status</span>
                <span className={isActive ? 'text-primary' : isCompleted ? 'text-on-surface' : 'text-on-surface-variant'}>
                  {displayNode?.status === "active" ? "Live" : displayNode?.status === "completed" ? "Completed" : displayNode?.status === "pending" ? "Upcoming" : displayNode?.status || "—"}
                </span>
              </div>
              {isCompleted && winnerId && (
                <div className="flex justify-between p-2 bg-surface-container-lowest border-l-2 border-primary">
                  <span className="text-on-surface-variant">Winner</span>
                  <span className="text-primary">{winnerId === t1 ? n1 : n2}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer — action buttons */}
        <div className="p-6 border-t border-outline-variant bg-surface-container-high flex flex-col gap-3 shrink-0">
          {(isActive || isCompleted) && displayNode?.roomId && (
            <button
              onClick={handleEnterRoom}
              className="w-full py-3 bg-primary text-on-primary font-label-sm rounded font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">login</span>
              ENTER ROOM
            </button>
          )}
          {(isActive) && displayNode?.roomId && (
            <button
              onClick={handleSpectate}
              className="w-full py-3 border border-outline-variant text-on-surface font-label-sm rounded hover:bg-surface-variant transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">visibility</span>
              SPECTATE
            </button>
          )}
          {isPending && (
            <div className="text-center font-label-sm text-xs text-on-surface-variant py-2">
              This match hasn't started yet. Check back soon.
            </div>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="w-full py-2 text-on-surface-variant font-label-sm text-xs hover:text-on-surface transition-colors"
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function BracketRoomClient({ contest, initialSnapshot, userId }: { contest: ContestListingItem; initialSnapshot: BracketSnapshot; userId?: string }) {
  const [selectedNode, setSelectedNode] = useState<BracketNode | null>(null);
  const [snapshot, setSnapshot] = useState<BracketSnapshot>(initialSnapshot);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(64);

  // Measure the actual header height for the sidebar positioning
  useEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.getBoundingClientRect().height);
    }
  }, []);

  // ── SSE: Subscribe to contest events and refresh snapshot ──
  useEffect(() => {
    const eventSource = new EventSource(`/api/events?contestId=${contest._id}`);

    eventSource.addEventListener('message', async (e) => {
      try {
        const data = JSON.parse(e.data);
        const payload = data.payload;
        const channel = data.channel as string;

        console.log('[CCW Bracket] SSE event received:', { channel, payload });

        // Refresh snapshot on any bracket/contest update
        if (
          channel === `events:contest:${contest._id}` &&
          payload?.type &&
          ['bracket.update', 'match.update', 'score.update', 'match.completed'].includes(payload.type)
        ) {
          console.log('[CCW Bracket] Refreshing snapshot due to:', payload.type);
          const res = await fetch(`/api/contests/${contest._id}/bracket/snapshot`);
          if (res.ok) {
            const data = await res.json();
            console.log('[CCW Bracket] New snapshot received:', data);
            setSnapshot(data);
          }
        }
      } catch (err) {
        console.error('[CCW Bracket] SSE parse error:', err);
      }
    });

    eventSource.addEventListener('connected', (e) => {
      console.log('[CCW Bracket] SSE connected:', JSON.parse(e.data));
    });

    eventSource.onerror = () => {
      // Browsers natively handle EventSource reconnects. No need to log the empty ErrorEvent object.
    };

    return () => {
      eventSource.close();
    };
  }, [contest._id]);

  const openMatchDetails = useCallback((e: React.MouseEvent, node: BracketNode) => {
    e.stopPropagation();
    setSelectedNode(node);
  }, []);

  const closeSidebar = useCallback(() => setSelectedNode(null), []);

  const currentRoundName = getRoundName(snapshot.currentRound, snapshot.totalRounds);
  const hasActiveMatches = snapshot.nodes.some(n => n.status === "active");

  const { nodes, edges } = useMemo(() => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    const rounds: BracketNode[][] = Array.from({ length: snapshot.totalRounds }, () => []);
    snapshot.nodes.forEach(nd => {
      if (nd.roundNumber >= 1 && nd.roundNumber <= snapshot.totalRounds) rounds[nd.roundNumber - 1].push(nd);
    });

    const X_GAP = 380;
    const Y_GAP = 200;

    for (let r = 0; r < snapshot.totalRounds; r++) {
      const isGrandFinal = r === snapshot.totalRounds - 1;
      rounds[r].forEach((nd, i) => {
        const scale = Math.pow(2, r);
        const x = r * X_GAP;
        const y = ((scale - 1) * Y_GAP) / 2 + i * scale * Y_GAP;

        flowNodes.push({
          id: nd.roomId,
          type: isGrandFinal ? 'grandFinalNode' : 'matchNode',
          position: { x, y },
          data: { node: nd, totalRounds: snapshot.totalRounds, openMatchDetails },
        });

        if (r < snapshot.totalRounds - 1) {
          const pi = Math.floor(i / 2);
          const parent = rounds[r + 1][pi];
          if (parent) {
            const active = nd.status === "completed" && nd.winner !== null;
            flowEdges.push({
              id: `e-${nd.roomId}-${parent.roomId}`,
              source: nd.roomId,
              target: parent.roomId,
              type: 'smoothstep',
              animated: active,
              style: { stroke: active ? '#2e7d32' : '#40493d', strokeWidth: 2 },
            });
          }
        }
      });
    }
    return { nodes: flowNodes, edges: flowEdges };
  }, [snapshot, openMatchDetails]);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hanken+Grotesk:wght@600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <div className="flex flex-col overflow-hidden relative dark stitch-container bg-background w-full text-on-surface font-body-md selection:bg-primary-container selection:text-on-primary-container" style={{ height: 'calc(100vh - 64px)' }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <header
          ref={headerRef}
          className="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4 w-full bg-background border-b border-outline-variant z-10 shrink-0"
        >
          <div className="flex gap-4 flex-col items-start">
            <div className="flex items-center gap-4 mb-4">
              <Link href="/internal/contests" className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors bg-surface-container-highest px-3 py-1.5 rounded border border-outline-variant hover:border-primary">
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                <span className="font-label-sm text-label-sm">Back to Contests</span>
              </Link>
              <div className="h-6 w-px bg-outline-variant mx-2 hidden md:block" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface">{contest.name}</h2>
                <span className="bg-primary-container text-on-primary-container font-label-sm text-label-sm px-2 py-1 rounded-sm ml-2">Knockout</span>
              </div>
              <p className="text-on-surface-variant font-body-md text-sm mt-1">Contests • {currentRoundName} • {hasActiveMatches ? 'Live' : 'Waiting'}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Live SSE indicator — only show "Live" */}
            <div className="hidden sm:flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant">
              <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
              <span className="font-label-sm text-label-sm text-on-surface-variant">Live</span>
            </div>
          </div>
        </header>

        {/* ── React Flow Canvas ────────────────────────────────── */}
        <div className="flex-1 w-full relative min-h-0 overflow-hidden">
          <style>{`
            .react-flow__handle { opacity: 0 !important; pointer-events: none !important; }
            .react-flow__node { cursor: pointer !important; }
            .react-flow__pane { cursor: grab !important; }
            .react-flow__pane:active { cursor: grabbing !important; }
            .react-flow__edge-path { stroke-linecap: round; }
            .react-flow__controls {
              box-shadow: 0 4px 12px rgb(0 0 0 / 0.4) !important;
              border-radius: 8px !important;
              overflow: hidden !important;
              border: 1px solid #40493d !important;
            }
            .react-flow__controls-button {
              background: #2a2a2a !important;
              border-bottom: 1px solid #40493d !important;
              color: #e5e2e1 !important;
              width: 32px !important; height: 32px !important;
              transition: all 0.15s ease !important;
            }
            .react-flow__controls-button:hover {
              background: #353534 !important;
              color: #88d982 !important;
            }
            .react-flow__controls-button svg { fill: currentColor !important; }
            .react-flow__controls-button:last-child { border-bottom: none !important; }
            .react-flow__background { opacity: 0.3; }
          `}</style>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.15}
            maxZoom={2.5}
            className="bg-surface-container-lowest"
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            onPaneClick={closeSidebar}
            onNodeClick={(e, node) => openMatchDetails(e as any, node.data.node)}
          >
            <Background color="#40493d" gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      {/* ── Match Detail Side Panel ─────────────────────────── */}
      <MatchSidePanel
        node={selectedNode}
        totalRounds={snapshot.totalRounds}
        onClose={closeSidebar}
        contestId={contest._id.toString()}
      />
    </>
  );
}
