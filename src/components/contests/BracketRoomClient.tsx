"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Circle,
  CircleCheck,
  Hourglass,
  LogIn,
  Trophy,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ContestListingItem } from "@/lib/actions/contests";
import { expectAppData } from "@/lib/api/result";
import {
  getRoundName,
  type BracketNode,
  type BracketSnapshot,
} from "@/types/bracket";

import BackLink from "@/components/shared/BackLink";
import CompatibleImage from "@/components/shared/CompatibleImage";

import styles from "./BracketRoomClient.module.scss";

const ReactFlow = dynamic(
  () => import("@xyflow/react").then((mod) => mod.ReactFlow),
  { ssr: false },
);
const Background = dynamic(
  () => import("@xyflow/react").then((mod) => mod.Background),
  { ssr: false },
);
const Controls = dynamic(
  () => import("@xyflow/react").then((mod) => mod.Controls),
  { ssr: false },
);

// ── Helpers ───────────────────────────────────────────────────────
function getInitials(name: string) {
  if (!name) return "??";
  const parts = name.split(/[\s_-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function TeamSlot({
  tid,
  tname,
  timage,
  fallback,
  isWinner,
}: {
  tid: string | null;
  tname: string | null;
  timage?: string | null;
  fallback: string;
  isWinner?: boolean;
}) {
  if (tid && tname) {
    return (
      <div
        className={`${styles.teamSlot} ${isWinner ? styles.teamSlotWinner : ""}`}
      >
        <div className={styles.teamSlotInner}>
          {timage ? (
            <CompatibleImage
              src={timage}
              alt={tname}
              className={styles.teamAvatar}
              width={24}
              height={24}
            />
          ) : (
            <div
              className={`${styles.teamAvatarFallback} ${styles.teamAvatarFallbackHi}`}
            >
              {getInitials(tname)}
            </div>
          )}
          <span
            className={`${styles.slotName} ${isWinner ? styles.slotNameWinner : ""}`}
          >
            {tname}
          </span>
          {isWinner && <Trophy className={styles.winnerTrophy} size={16} />}
        </div>
      </div>
    );
  }
  return (
    <div className={`${styles.teamSlot} ${styles.teamSlotTbd}`}>
      <span className={styles.slotTbd}>{fallback}</span>
    </div>
  );
}

function TeamRow({
  tid,
  tname,
  timage,
  score,
  isWinner,
  isLoser,
  isActive,
}: {
  tid: string | null;
  tname: string | null;
  timage?: string | null;
  score: number;
  isWinner: boolean;
  isLoser: boolean;
  isActive: boolean;
}) {
  if (!tid || !tname) {
    return (
      <div className={styles.teamRow}>
        <div className={styles.rowInner}>
          <span className={styles.rowTbd}>TBD</span>
        </div>
        <span className={styles.rowScoreMuted}>-</span>
      </div>
    );
  }
  const ini = getInitials(tname);

  const renderAvatar = (hi?: boolean) => {
    if (timage) {
      return (
        <CompatibleImage
          src={timage}
          alt={tname}
          className={styles.teamAvatar}
          width={24}
          height={24}
        />
      );
    }
    return (
      <div
        className={`${styles.teamAvatarFallback} ${hi ? styles.teamAvatarFallbackHi : ""}`}
      >
        {ini}
      </div>
    );
  };

  if (isWinner) {
    return (
      <div className={`${styles.teamRow} ${styles.teamRowWinner}`}>
        <div className={styles.rowInner}>
          {renderAvatar(true)}
          <span className={styles.rowName}>{tname}</span>
        </div>
        <span className={styles.rowScoreWinner}>{score}</span>
      </div>
    );
  }
  if (isLoser) {
    return (
      <div className={styles.teamRow}>
        <div className={`${styles.rowInner} ${styles.rowInnerLoser}`}>
          {renderAvatar(false)}
          <span className={styles.rowNameMuted}>{tname}</span>
        </div>
        <span className={styles.rowScoreLoser}>{score}</span>
      </div>
    );
  }
  if (isActive) {
    return (
      <div className={`${styles.teamRow} ${styles.teamRowActive}`}>
        <div className={styles.rowInner}>
          {renderAvatar(true)}
          <span className={styles.rowName}>{tname}</span>
        </div>
        <span className={styles.rowScoreActive}>{score}</span>
      </div>
    );
  }
  return (
    <div className={styles.teamRow}>
      <div className={styles.rowInner}>
        {renderAvatar(false)}
        <span className={styles.rowName}>{tname}</span>
      </div>
      <span className={styles.rowScoreMuted}>{score === 0 ? "-" : score}</span>
    </div>
  );
}

// ── Grand Final Node ──────────────────────────────────────────────
type BracketFlowNodeData = {
  node: BracketNode;
  totalRounds: number;
  openMatchDetails: (event: React.MouseEvent, node: BracketNode) => void;
};

type BracketFlowNode = Node<BracketFlowNodeData>;

function GrandFinalNode({ data }: NodeProps<BracketFlowNode>) {
  const { node, openMatchDetails } = data;
  const t1 = node.teams[0],
    t2 = node.teams[1];
  const n1 = node.teamNames?.[0],
    n2 = node.teamNames?.[1];
  const isCompleted = node.status === "completed";
  const isActive = node.status === "active";
  const isWaiting = node.status === "waiting";
  return (
    <div
      className={`${styles.matchNode} ${
        isActive ? styles.nodeActive : isWaiting ? styles.nodeWaiting : ""
      } ${!t1 && !t2 ? styles.nodeEmpty : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (openMatchDetails) openMatchDetails(e, node);
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className={styles.nodeHeader}>
        <span className={styles.nodeHeaderTitle}>
          <Trophy className={styles.trophyIcon} size={16} />
          Grand Final
        </span>
        {isCompleted ? (
          <span className={`${styles.badge} ${styles.badgePrimary}`}>
            Completed
          </span>
        ) : isActive ? (
          <span className={`${styles.badge} ${styles.badgePrimary}`}>
            <span className={styles.dotLive} /> Live
          </span>
        ) : isWaiting ? (
          <span className={`${styles.badge} ${styles.badgeWarning}`}>
            <span className={styles.dotWaiting} /> Waiting
          </span>
        ) : (
          <span className={`${styles.badge} ${styles.badgeNeutral}`}>
            Upcoming
          </span>
        )}
      </div>
      <div className={styles.nodeBody}>
        <TeamSlot
          tid={t1}
          tname={n1}
          timage={node.teamImages?.[0]}
          fallback="Winner SF 1"
          isWinner={isCompleted && node.winner === t1}
        />
        <div className={styles.vsLabel}>VS</div>
        <TeamSlot
          tid={t2}
          tname={n2}
          timage={node.teamImages?.[1]}
          fallback="Winner SF 2"
          isWinner={isCompleted && node.winner === t2}
        />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// ── Standard Match Card ───────────────────────────────────────────
function MatchCardNode({ data }: NodeProps<BracketFlowNode>) {
  const { node, openMatchDetails, totalRounds } = data;
  const t1 = node.teams[0],
    t2 = node.teams[1];
  const n1 = node.teamNames?.[0],
    n2 = node.teamNames?.[1];

  const isBye = node.status === "bye";
  const isCompleted = node.status === "completed";
  const isActive = node.status === "active";
  const isWaiting = node.status === "waiting";
  const isPending = !isCompleted && !isActive && !isWaiting && !isBye;

  const roundName = getRoundName(node.roundNumber, totalRounds);
  const matchLabel = `${roundName === "Final" || roundName.startsWith("Semi") ? roundName.replace("s", "") : roundName} ${node.matchIndex + 1}`;

  const winnerId = node.winner;
  const t1Win = Boolean(isCompleted && t1 && t1 === winnerId);
  const t2Win = Boolean(isCompleted && t2 && t2 === winnerId);
  const t1Lose = Boolean(isCompleted && t1 && t1 !== winnerId);
  const t2Lose = Boolean(isCompleted && t2 && t2 !== winnerId);

  const badge = isCompleted ? (
    <span className={`${styles.badge} ${styles.badgePrimary}`}>Final</span>
  ) : isActive ? (
    <span className={`${styles.badge} ${styles.badgePrimary}`}>
      <span className={styles.dotLive} /> Live
    </span>
  ) : isWaiting ? (
    <span className={`${styles.badge} ${styles.badgeWarning}`}>
      <span className={styles.dotWaiting} /> Waiting
    </span>
  ) : isBye ? (
    <span className={`${styles.badge} ${styles.badgeNeutral}`}>Bye</span>
  ) : (
    <span className={`${styles.badge} ${styles.badgeNeutral}`}>Upcoming</span>
  );

  return (
    <div
      className={`${styles.matchNode} ${
        isActive ? styles.nodeActive : isWaiting ? styles.nodeWaiting : ""
      } ${isPending ? styles.nodePending : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (openMatchDetails) openMatchDetails(e, node);
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className={styles.nodeHeader}>
        <span className={styles.nodeHeaderLabel}>{matchLabel}</span>
        {badge}
      </div>
      <div className={`${styles.nodeBody} ${styles.nodeBodyCompact}`}>
        <TeamRow
          tid={t1}
          tname={n1}
          timage={node.teamImages?.[0]}
          score={node.scores[0]}
          isWinner={t1Win}
          isLoser={t1Lose}
          isActive={isActive}
        />
        <TeamRow
          tid={t2}
          tname={n2}
          timage={node.teamImages?.[1]}
          score={node.scores[1]}
          isWinner={t2Win}
          isLoser={t2Lose}
          isActive={isActive}
        />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { matchNode: MatchCardNode, grandFinalNode: GrandFinalNode };

function isBracketNode(value: unknown): value is BracketNode {
  return Boolean(
    value &&
    typeof value === "object" &&
    "roomId" in value &&
    typeof value.roomId === "string" &&
    "roundNumber" in value &&
    typeof value.roundNumber === "number" &&
    "teams" in value &&
    Array.isArray(value.teams),
  );
}

// ── Match Detail Side Panel ────────────────────────────────────────
function MatchSidePanel({
  node,
  totalRounds,
  onClose,
  contestId,
  data,
}: {
  node: BracketNode | null;
  totalRounds: number;
  onClose: () => void;
  contestId: string;
  data?: { currentUserTeamId?: string | null };
}) {
  const router = useRouter();
  const [prevNode, setPrevNode] = useState<BracketNode | null>(node);
  const [displayNode, setDisplayNode] = useState<BracketNode | null>(node);

  // Accept currentUserTeamId to determine if the user is a participant
  const { currentUserTeamId } = data || {};
  const isParticipant =
    currentUserTeamId && displayNode?.teams.includes(currentUserTeamId);

  if (node !== prevNode) {
    setPrevNode(node);
    if (node !== null) {
      setDisplayNode(node);
    }
  }

  const handleEnterRoom = () => {
    if (!displayNode?.roomId) return;
    router.push(
      `/internal/contests/${contestId}?matchRoomId=${displayNode.roomId}&from=bracket`,
    );
  };

  const handleViewResults = () => {
    if (!displayNode?.roomId) return;
    router.push(
      `/internal/contests/rooms/${displayNode.roomId}/result?from=bracket`,
    );
  };

  const t1 = displayNode?.teams[0],
    t2 = displayNode?.teams[1];
  const n1 = displayNode?.teamNames?.[0],
    n2 = displayNode?.teamNames?.[1];
  const s1 = displayNode?.scores[0] ?? 0,
    s2 = displayNode?.scores[1] ?? 0;
  const isCompleted = displayNode?.status === "completed";
  const isActive = displayNode?.status === "active";
  const isPending = displayNode?.status === "pending";
  const roundName = displayNode
    ? getRoundName(displayNode.roundNumber, totalRounds)
    : "";
  const matchLabel = displayNode
    ? `${roundName.includes("Final") ? roundName : roundName} ${displayNode.matchIndex + 1}`
    : "";
  const winnerId = displayNode?.winner;

  const isOpen = node !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`${styles.backdrop} ${isOpen ? styles.backdropOpen : ""}`}
        onClick={onClose}
        aria-hidden
      />

      {/* Sidebar */}
      <aside
        className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ""}`}
      >
        {/* Sidebar Header */}
        <div className={styles.sidebarHeader}>
          <div>
            <span className={styles.sidebarLabel}>{matchLabel}</span>
            <h3 className={styles.sidebarTitle}>Match Details</h3>
            <p className={styles.sidebarStatus}>
              {isActive ? (
                <>
                  <Circle className={styles.statusLive} size={12} />
                  Live
                </>
              ) : isCompleted ? (
                <>
                  <CircleCheck className={styles.statusDone} size={12} />
                  Completed
                </>
              ) : (
                <>
                  <Hourglass className={styles.statusPending} size={12} />
                  Upcoming
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={styles.sidebarClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Sidebar Body */}
        <div className={styles.sidebarBody}>
          {/* Score Overview */}
          <div className={styles.scoreOverview}>
            {/* Team 1 */}
            <div
              className={`${styles.scoreTeam} ${
                t1 && winnerId && t1 === winnerId ? styles.scoreTeamWinner : ""
              }`}
            >
              <div
                className={`${styles.scoreAvatar} ${
                  t1 && winnerId && t1 === winnerId
                    ? styles.scoreAvatarWinner
                    : ""
                }`}
              >
                {n1 ? getInitials(n1) : "??"}
              </div>
              <span className={styles.scoreName}>{n1 || "TBD"}</span>
              <span
                className={`${styles.scoreValue} ${
                  t1 && winnerId && t1 === winnerId
                    ? styles.scoreValueWinner
                    : ""
                }`}
              >
                {t1 ? s1 : "-"}
              </span>
              {t1 && winnerId && t1 === winnerId && (
                <span className={styles.winnerPill}>Winner</span>
              )}
            </div>

            {/* VS */}
            <div className={styles.vsCol}>
              <span className={styles.vsColLabel}>VS</span>
              {isActive && <span className={styles.dotError} />}
            </div>

            {/* Team 2 */}
            <div
              className={`${styles.scoreTeam} ${
                t2 && winnerId && t2 === winnerId ? styles.scoreTeamWinner : ""
              }`}
            >
              <div
                className={`${styles.scoreAvatar} ${
                  t2 && winnerId && t2 === winnerId
                    ? styles.scoreAvatarWinner
                    : ""
                }`}
              >
                {n2 ? getInitials(n2) : "??"}
              </div>
              <span className={styles.scoreName}>{n2 || "TBD"}</span>
              <span
                className={`${styles.scoreValue} ${
                  t2 && winnerId && t2 === winnerId
                    ? styles.scoreValueWinner
                    : ""
                }`}
              >
                {t2 ? s2 : "-"}
              </span>
              {t2 && winnerId && t2 === winnerId && (
                <span className={styles.winnerPill}>Winner</span>
              )}
            </div>
          </div>

          {/* Match Info */}
          <div>
            <h4 className={styles.matchInfoHeading}>Match Info</h4>
            <div className={styles.infoList}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Round</span>
                <span className={styles.infoValue}>{roundName}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Status</span>
                <span
                  className={
                    isActive
                      ? styles.infoValueActive
                      : isCompleted
                        ? styles.infoValue
                        : styles.infoLabel
                  }
                >
                  {displayNode?.status === "active"
                    ? "Live"
                    : displayNode?.status === "completed"
                      ? "Completed"
                      : displayNode?.status === "pending"
                        ? "Upcoming"
                        : displayNode?.status || "-"}
                </span>
              </div>
              {isCompleted && winnerId && (
                <div className={`${styles.infoRow} ${styles.infoRowWinner}`}>
                  <span className={styles.infoLabel}>Winner</span>
                  <span className={styles.infoValueWinner}>
                    {winnerId === t1 ? n1 : n2}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer - action buttons */}
        <div className={styles.sidebarFooter}>
          {/* COMPLETED STATUS */}
          {isCompleted && displayNode?.roomId && (
            <button onClick={handleViewResults} className={styles.footerBtn}>
              <BarChart3 className={styles.icon18} size={18} />
              VIEW RESULTS
            </button>
          )}

          {/* ACTIVE STATUS */}
          {isActive && displayNode?.roomId && isParticipant && (
            <button onClick={handleEnterRoom} className={styles.footerBtn}>
              <LogIn className={styles.icon18} size={18} />
              ENTER ROOM
            </button>
          )}

          {/* PENDING STATUS */}
          {isPending && (
            <div className={styles.footerNote}>
              Status: Pending. Teams to be decided.
            </div>
          )}

          {/* WAITING STATUS */}
          {(displayNode?.status as string) === "waiting" &&
            isParticipant &&
            displayNode?.roomId && (
              <button onClick={handleEnterRoom} className={styles.footerBtn}>
                <LogIn className={styles.icon18} size={18} />
                ENTER ROOM
              </button>
            )}
          {(displayNode?.status as string) === "waiting" && !isParticipant && (
            <div className={styles.footerNote}>
              Waiting for the participants to get ready...
            </div>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={styles.footerClose}
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function BracketRoomClient({
  contest,
  initialSnapshot,
  userId,
  currentUserTeamId,
}: {
  contest: ContestListingItem;
  initialSnapshot: BracketSnapshot;
  userId?: string;
  currentUserTeamId?: string | null;
}) {
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
    const eventSource = new EventSource(
      `/api/contests/stream?contestId=${contest._id}`,
    );

    eventSource.addEventListener("message", async (e) => {
      try {
        const data = JSON.parse(e.data);
        const payload = data.payload;
        const channel = data.channel as string;

        // Refresh snapshot on any bracket/contest update
        if (
          channel === `events:contest:${contest._id}` &&
          payload?.type &&
          [
            "bracket.update",
            "match.update",
            "score.update",
            "match.completed",
          ].includes(payload.type)
        ) {
          const res = await fetch(
            `/api/contests/${contest._id}/bracket/snapshot`,
          );
          if (res.ok) {
            const data = await expectAppData<BracketSnapshot>(res);
            setSnapshot(data);
          }
        }
      } catch {}
    });

    eventSource.onerror = () => {
      // Browsers natively handle EventSource reconnects. No need to log the empty ErrorEvent object.
    };

    return () => {
      eventSource.close();
    };
  }, [contest._id]);

  const openMatchDetails = useCallback(
    (e: React.MouseEvent, node: BracketNode) => {
      e.stopPropagation();
      setSelectedNode(node);
    },
    [],
  );

  const closeSidebar = useCallback(() => setSelectedNode(null), []);

  const currentRoundName = getRoundName(
    snapshot.currentRound,
    snapshot.totalRounds,
  );
  const hasActiveMatches = snapshot.nodes.some((n) => n.status === "active");

  const { nodes, edges } = useMemo(() => {
    const flowNodes: BracketFlowNode[] = [];
    const flowEdges: Edge[] = [];
    const rounds: BracketNode[][] = Array.from(
      { length: snapshot.totalRounds },
      () => [],
    );
    snapshot.nodes.forEach((nd) => {
      if (nd.roundNumber >= 1 && nd.roundNumber <= snapshot.totalRounds)
        rounds[nd.roundNumber - 1].push(nd);
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
          type: isGrandFinal ? "grandFinalNode" : "matchNode",
          position: { x, y },
          data: {
            node: nd,
            totalRounds: snapshot.totalRounds,
            openMatchDetails,
          },
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
              type: "smoothstep",
              animated: active,
              style: {
                stroke: active ? "var(--success)" : "var(--border)",
                strokeWidth: 2,
              },
            });
          }
        }
      });
    }
    return { nodes: flowNodes, edges: flowEdges };
  }, [snapshot, openMatchDetails]);

  return (
    <div className={styles.page}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header ref={headerRef} className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTop}>
            <BackLink href="/internal/contests" label="Back to Contests" />
            <div className={styles.headerDivider} />
          </div>
          <div>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{contest.name}</h2>
              <span className={styles.knockoutBadge}>Knockout</span>
            </div>
            <p className={styles.subtitle}>
              Contests • {currentRoundName} •{" "}
              {hasActiveMatches ? "Live" : "Waiting"}
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {/* Live SSE indicator - only show "Live" */}
          <div className={styles.liveIndicator}>
            <span className={styles.dotError} />
            Live
          </div>
        </div>
      </header>

      {/* ── React Flow Canvas ────────────────────────────────── */}
      <div className={styles.canvas}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.15}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          onPaneClick={closeSidebar}
          onNodeClick={(event, node) => {
            if (isBracketNode(node.data.node)) {
              openMatchDetails(event, node.data.node);
            }
          }}
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {/* ── Match Detail Side Panel ─────────────────────────── */}
      <MatchSidePanel
        node={selectedNode}
        totalRounds={snapshot.totalRounds}
        onClose={closeSidebar}
        contestId={contest._id.toString()}
        data={{ currentUserTeamId }}
      />
    </div>
  );
}
