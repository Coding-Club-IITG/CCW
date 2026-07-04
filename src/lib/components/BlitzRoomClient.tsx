"use client";

import Link from "next/link";
import { ContestListingItem } from "@/lib/actions/contests";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface EventPayload {
  type: string;
  [key: string]: any;
}

export default function BlitzRoomClient({
  contest,
  roomId,
  roomName,
  teamId,
  userId,
  cfHandle,
  teams,
  initialReadyUserIds = [],
  initialOnlineUserIds = [],
  initialMatchState = "waiting",
  initialProblems = [],
  initialScores = {},
  initialProblemIndex = 0,
  from
}: {
  contest: ContestListingItem;
  roomId: string;
  roomName: string;
  teamId: string;
  userId: string;
  cfHandle?: string;
  teams?: any[];
  initialReadyUserIds?: string[];
  initialOnlineUserIds?: string[];
  initialMatchState?: "waiting" | "active" | "completed";
  initialProblems?: any[];
  initialScores?: Record<string, number>;
  initialProblemIndex?: number;
  from?: string;
  isSpectator?: boolean;
}) {
  const router = useRouter();
  
  const [matchState, setMatchState] = useState<"waiting" | "active" | "completed">(initialMatchState);
  const [showMatchStartedModal, setShowMatchStartedModal] = useState(false);
  const [problems, setProblems] = useState<any[]>(initialProblems);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(initialProblemIndex);
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [readyUserIds, setReadyUserIds] = useState<Set<string>>(new Set(initialReadyUserIds));
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set(initialOnlineUserIds || [userId])); // Track online users
  const [isReady, setIsReady] = useState(initialReadyUserIds.includes(userId));
  const [syncing, setSyncing] = useState(false);
  const [syncCooldown, setSyncCooldown] = useState(0);

  useEffect(() => {
    if (syncCooldown > 0) {
      const timer = setInterval(() => {
        setSyncCooldown(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [syncCooldown]);

  useEffect(() => {
    const lastSyncStr = localStorage.getItem(`sync_${roomId}_${userId}`);
    if (lastSyncStr) {
      const lastSync = parseInt(lastSyncStr, 10);
      const elapsed = (Date.now() - lastSync) / 1000;
      if (elapsed < 60 && elapsed > 0) {
        setSyncCooldown(Math.ceil(60 - elapsed));
      }
    }
  }, [roomId, userId]);
  
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  
  const [animationKey, setAnimationKey] = useState(0); // For triggering CSS animations

  // Redirect to results page immediately ONLY if the match was already completed on initial load (i.e. refresh)
  useEffect(() => {
    if (initialMatchState === "completed") {
      router.replace(`/internal/contests/rooms/${roomId}/result`);
    }
  }, [initialMatchState, roomId, router]);

  // Also redirect dynamically if the match completes while connected
  useEffect(() => {
    if (matchState === "completed" && initialMatchState !== "completed") {
      const t = setTimeout(() => {
        router.replace(`/internal/contests/rooms/${roomId}/result`);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [matchState, initialMatchState, roomId, router]);

  useEffect(() => {
    const eventSource = new EventSource(`/api/events?roomId=${roomId}`);
    
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.payload) {
          handleEvent(data.payload);
        }
      } catch (err) {}
    };

    return () => {
      eventSource.close();
    };
  }, []);



  const handleEvent = (payload: EventPayload) => {
    switch (payload.type) {
      case "room.state_sync":
        setMatchState(prev => {
          if (prev !== "active" && payload.state.status === "active") {
            setShowMatchStartedModal(true);
          }
          return payload.state.status;
        });
        if (payload.problems) setProblems(payload.problems);
        if (payload.scores) setScores(payload.scores);
        if (payload.state.status === "active") {
          addActivity("info", "Match started! Good luck.", "Just now");
        }
        break;
      case "room.advance":
        setCurrentProblemIndex(payload.problemIndex);
        setProblems(prev => {
          const arr = [...prev];
          arr[payload.problemIndex] = payload.nextProblem;
          return arr;
        });
        setAnimationKey(k => k + 1);
        const solverName = getMemberName(payload.solvedBy.userId);
        addActivity("check_circle", `${solverName} solved a problem!`, "Just now", "text-primary");
        break;
      case "room.score":
        setScores(payload.scores);
        break;
      case "room.end":
        setMatchState("completed");
        if (payload.finalScores) setScores(payload.finalScores);
        break;
      case "sync.queued":
        setSyncing(true);
        addActivity("sync", "Submission queued for verification...", "Just now", "text-secondary");
        break;
      case "sync.detected":
        setSyncing(false);
        if (payload.verdict === "OK") {
          addActivity("check_circle", `Valid AC detected! +${payload.pointsAwarded || 100} pts`, "Just now", "text-primary");
        } else {
          addActivity("error", `Submission failed: ${payload.verdict}`, "Just now", "text-error");
        }
        break;
      case "room.user_ready":
        setReadyUserIds(prev => {
          const newSet = new Set(prev);
          newSet.add(payload.userId);
          return newSet;
        });
        if (payload.userId === userId) {
          setIsReady(true);
        }
        break;
      case "sync.failed":
        setSyncing(false);
        if (payload.verdict) {
          addActivity("error", `Sync succeeded, but verdict is ${payload.verdict}`, "Just now", "text-error");
        } else {
          addActivity("error", `Sync failed: ${payload.reason || "Unknown error"}`, "Just now", "text-error");
        }
        break;
      case "presence.online": {
        const uName = getMemberName(payload.userId);
        setOnlineUserIds(prev => {
          const newSet = new Set(prev);
          newSet.add(payload.userId);
          return newSet;
        });
        addActivity("person", `${uName} connected.`, "Just now", "text-secondary");
        break;
      }
      case "presence.offline": {
        const uName = getMemberName(payload.userId);
        setOnlineUserIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(payload.userId);
          return newSet;
        });
        setReadyUserIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(payload.userId);
          return newSet;
        });
        addActivity("person_off", `${uName} disconnected.`, "Just now", "text-error");
        break;
      }
    }
  };

  const getMemberName = (uid: string) => {
    if (!teams) return "Unknown";
    for (const t of teams) {
      for (const m of t.members) {
        if (m.id === uid) return m.name;
      }
    }
    return uid === userId ? "You" : "Unknown";
  };

  const addActivity = (icon: string, text: string, time: string, color: string = "text-on-surface") => {
    setActivityFeed(prev => [{ icon, text, time, color, id: Date.now() }, ...prev].slice(0, 10));
  };

  const handleReady = async () => {
    setIsReady(true);
    await fetch(`/api/contests/rooms/${roomId}/ready`, { method: "POST" });
  };

  const handleSync = async () => {
    if (syncing || matchState !== "active" || syncCooldown > 0) return;
    setSyncing(true);
    const activeProblem = problems[currentProblemIndex];
    if (!activeProblem) return;
    
    const res = await fetch("/api/contests/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        teamId,
        cfHandle: cfHandle || "dummy0", // Use real handle if available, otherwise fallback
        problemId: activeProblem.problemId
      })
    });
    
    const cooldown = process.env.NODE_ENV === "development" ? 5 : 60;
    setSyncCooldown(cooldown); // Apply frontend cooldown directly
    localStorage.setItem(`sync_${roomId}_${userId}`, Date.now().toString());
    
    if (!res.ok) {
      // If it failed immediately (e.g. 429), turn off syncing spinner since SSE won't fire
      setSyncing(false);
    }
  };

  const activeProblem = problems[currentProblemIndex] || { name: "Loading...", rating: 0 };
  const totalProblems = problems.length || 5;

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
        @keyframes slide-in {
          0% { opacity: 0; transform: translateX(20px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .problem-transition { animation: slide-in 0.4s ease-out forwards; }
        @keyframes loading-dots {
          0% { content: ''; }
          25% { content: '.'; }
          50% { content: '..'; }
          75%, 100% { content: '...'; }
        }
        .animated-dots::after {
          content: '';
          animation: loading-dots 1.5s infinite;
          display: inline-block;
          width: 20px;
          text-align: left;
      <div className="absolute inset-0 bg-pattern opacity-30 pointer-events-none"></div>
      
      <main className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-6 relative z-10 max-w-container-max-width mx-auto w-full">
        <div className="flex gap-4 items-center">
          {isSpectator && (
            <span className="text-secondary font-label-sm uppercase tracking-widest px-3 py-1 bg-secondary-container rounded text-on-secondary-container">
              Spectating
            </span>
          )}
          <Link
            href={from === 'bracket' ? `/internal/contests/${contest._id}` : `/internal/contests`}
            className="flex items-center gap-2 px-3 py-1.5 text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20 rounded-lg transition-all font-label-sm text-label-sm uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>{from === 'bracket' ? 'Back to Bracket Canvas' : 'Back to Contests'}
          </Link>
        </div>
        
        {/* Compact HUD */}
        <header className="flex justify-between items-center bg-surface-container-low border border-outline-variant p-4 rounded-xl cyber-glow">
          <div className="flex items-center gap-4">
            <h1 className="font-headline-lg text-[20px] text-on-surface tracking-tight">{contest.name}</h1>
            <div className={`flex items-center gap-2 px-3 py-1 bg-surface-container border rounded-full font-label-sm text-xs uppercase tracking-wider ${matchState === 'active' ? 'border-primary/30 text-primary' : 'border-outline-variant text-on-surface-variant'}`}>
              {matchState === 'active' && <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>}
              {matchState === 'active' ? 'LIVE MATCH' : matchState === 'completed' ? 'MATCH OVER' : 'WAITING FOR PLAYERS'}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 font-headline-lg text-[24px]">
              <span className="text-primary">Team Alpha</span>
              <span className="text-on-surface font-bold">{Object.values(scores)[0] || 0} pts</span>
              <span className="text-outline-variant font-body-md text-body-md">VS</span>
              <span className="text-secondary font-bold">{Object.values(scores)[1] || 0} pts</span>
              <span className="text-on-surface-variant">Team Beta</span>
            </div>
          </div>
        </header>

        {/* 3-Column Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-hidden">
          
          {/* Left Sidebar (Roster) */}
          <div className="lg:col-span-1 flex flex-col h-full overflow-hidden">
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col gap-4 h-full overflow-y-auto scroll-hide">
              <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest sticky top-0 bg-surface-container-low z-10 pb-2 border-b border-outline-variant/50">Active Roster</h2>
              
              {teams?.map((team) => (
                <div key={team._id} className="flex flex-col gap-2 mt-4 first:mt-0">
                  <span className={`font-label-sm text-[10px] uppercase tracking-widest pb-1 mb-1 ${team._id === teamId ? 'text-primary' : 'text-secondary'}`}>
                    {team.name}
                  </span>
                  {team.members.map((member: any) => {
                    const memberIsReady = readyUserIds.has(member.id);
                    const memberIsOnline = onlineUserIds.has(member.id);
                    
                    const borderColor = memberIsReady ? 'border-primary' : (!memberIsOnline ? 'border-error' : 'border-transparent');
                    const dotColor = memberIsReady ? 'bg-primary' : 'bg-error';

                    return (
                      <div key={member.id} className={`flex items-center gap-3 p-2 rounded bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors border-l-2 ${borderColor}`}>
                        <img 
                          src={member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name || "U")}&background=random`} 
                          alt={member.name} 
                          className={`w-6 h-6 rounded-full object-cover border ${memberIsOnline ? 'border-primary/50' : 'border-error/50 grayscale'}`} 
                        />
                        <span className="font-label-sm text-sm text-on-surface flex-1">
                          {member.name} {member.id === userId && "(You)"}
                        </span>
                        <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Center Stage - Active Problem */}
          <div className="lg:col-span-2 flex flex-col h-full overflow-hidden">
            <div className="flex-1 flex flex-col bg-surface-container-low border border-outline-variant rounded-xl p-6 overflow-y-auto scroll-hide relative">
              
              {/* Center Stage - Active Problem / Waiting Room */}
              {matchState === "waiting" ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 cyber-glow">
                    <span className="material-symbols-outlined text-6xl text-primary animate-pulse">groups</span>
                  </div>
                  <h2 className="text-3xl font-bold mb-4 text-on-surface">Waiting for Players</h2>
                  <p className="text-on-surface-variant mb-8 max-w-md text-lg">
                    The arena is being prepared. Review your strategy—the match begins when all teams are ready.
                  </p>
                  {matchState === 'waiting' && !isSpectator && (
                    <button
                      onClick={handleReady}
                      className={`px-8 py-3 rounded-full font-label-lg font-bold transition-all ${
                        isReady 
                          ? 'bg-secondary-container text-on-secondary-container shadow-[0_0_15px_rgba(var(--md-sys-color-secondary-container),0.4)]' 
                          : 'bg-primary text-on-primary hover:opacity-90 shadow-lg hover:shadow-xl shadow-primary/20'
                      }`}
                    >
                      {isReady ? "READY" : "I AM READY"}
                    </button>
                  )}
                  {matchState === 'waiting' && isSpectator && (
                    <div className="text-on-surface-variant font-label-md">Waiting for players to be ready...</div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-6 sticky top-0 bg-surface-container-low z-20 pb-2 border-b border-outline-variant/50">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-sm">target</span>
                      <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest">Problem {currentProblemIndex + 1} of {totalProblems}</span>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: totalProblems }).map((_, i) => (
                        <div 
                          key={i} 
                          className={`h-1.5 w-8 rounded-full ${
                            i < currentProblemIndex ? "bg-primary" : 
                            i === currentProblemIndex ? "bg-primary animate-pulse cyber-glow" : 
                            "bg-surface-variant"
                          }`}
                        ></div>
                      ))}
                    </div>
                  </div>

                  <div key={animationKey} className="bg-surface border border-outline-variant rounded-lg relative overflow-hidden flex flex-col p-6 problem-transition">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                      <span className="material-symbols-outlined text-9xl">code_blocks</span>
                    </div>
                    <div className="z-10 mb-4">
                      <h1 className="font-headline-lg-mobile md:font-headline-lg text-[32px] md:text-[40px] font-bold text-on-surface mb-2">{activeProblem.problemId ? `${activeProblem.problemId} - ` : ''}{activeProblem.name}</h1>
                      <div className="flex items-center gap-4 font-label-sm text-label-sm text-on-surface-variant">
                        <span className="flex items-center gap-1 bg-surface-variant text-on-surface px-2 py-1 rounded">
                          <span className="material-symbols-outlined text-[16px]">bar_chart</span>
                          Rating: {activeProblem.rating}
                        </span>
                        <span className="flex items-center gap-1 text-primary">
                          <span className="material-symbols-outlined text-[16px]">stars</span>
                          Points: {activeProblem.points || 100}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-outline-variant flex items-center gap-4 z-10 mb-4 pt-4 mt-4">
                      <a 
                        href={`https://codeforces.com/contest/${activeProblem.problemId?.replace(/[^0-9]/g, '')}/problem/${activeProblem.problemId?.replace(/[0-9]/g, '')}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-2 px-6 border border-outline-variant rounded-lg font-label-sm text-label-sm text-on-surface hover:bg-surface-variant transition-colors py-3"
                      >
                        <span className="material-symbols-outlined">open_in_new</span>
                        Open in Codeforces
                      </a>
                      {!isSpectator && (
                        <button 
                          className={`w-full py-2.5 rounded font-label-md font-bold transition-all flex items-center justify-center gap-2 ${
                            (syncing || matchState !== 'active' || syncCooldown > 0)
                              ? 'bg-surface-container-highest text-on-surface-variant opacity-50' 
                              : 'bg-primary text-on-primary hover:opacity-90 shadow-lg shadow-primary/20'
                          }`}
                          onClick={handleSync}
                          disabled={syncing || matchState !== 'active' || syncCooldown > 0}
                          title={syncCooldown > 0 ? `Wait ${syncCooldown}s before syncing again` : ""}
                          style={{ cursor: (syncing || matchState !== 'active' || syncCooldown > 0) ? 'not-allowed' : 'pointer' }}
                        >
                          <span className={`material-symbols-outlined ${syncing ? 'animate-spin' : ''}`}>
                            {syncCooldown > 0 && !syncing ? 'hourglass_empty' : 'sync'}
                          </span>
                          {syncing ? "Syncing..." : syncCooldown > 0 ? `Wait ${syncCooldown}s` : "Sync Submission"}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Sidebar (Activity Log) */}
          <div className="lg:col-span-1 flex flex-col h-full overflow-hidden">
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col h-full overflow-hidden relative">
              <div className="sticky top-0 bg-surface-container-low z-10 pb-2 border-b border-outline-variant/50 mb-4">
                <h2 className="font-label-sm text-label-sm text-on-surface font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">rss_feed</span>
                  Activity Feed
                </h2>
                <p className="text-[10px] text-on-surface-variant mt-1 opacity-75">
                  Logs since last refresh. May disappear on reload.
                </p>
              </div>
              <div className="flex flex-col gap-4 overflow-y-auto scroll-hide font-label-sm text-label-sm h-full">
                {activityFeed.length === 0 ? (
                  <p className="text-on-surface-variant text-center mt-4">No activity yet.</p>
                ) : (
                  activityFeed.map(act => (
                    <div key={act.id} className="flex gap-3 problem-transition">
                      <div className="mt-1"><span className={`material-symbols-outlined ${act.color} text-sm`}>{act.icon}</span></div>
                      <div>
                        <p className="text-on-surface">{act.text}</p>
                        <span className="text-on-surface-variant text-[11px]">{act.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Match Started Overlay Modal */}
      {showMatchStartedModal && (
        <div className="fixed bottom-gutter right-gutter z-50 problem-transition" style={{ bottom: '24px', right: '24px' }}>
          <div className="bg-surface-container-highest border border-primary/30 rounded-xl p-6 shadow-2xl w-80 relative overflow-hidden cyber-glow mb-4">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary"></div>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-3xl">play_arrow</span>
                <h3 className="font-headline-lg-mobile text-[24px] font-bold text-on-surface">Match Started!</h3>
              </div>
            </div>
            <p className="font-body-md text-on-surface-variant mb-6">
              The first problem has been revealed. Good luck!
            </p>
            <button 
              onClick={() => setShowMatchStartedModal(false)}
              className="w-full py-2 bg-primary-container hover:brightness-110 text-on-primary-container rounded-lg font-label-sm text-label-sm transition-colors font-bold"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Match Over Overlay Modal */}
      {matchState === 'completed' && (
        <div className="fixed bottom-gutter right-gutter z-50 problem-transition" style={{ bottom: '24px', right: '24px' }}>
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
              Final Scores: <br/>
              <strong className="text-primary text-lg">Team Alpha: {Object.values(scores)[0] || 0}</strong><br/>
              <strong className="text-secondary text-lg">Team Beta: {Object.values(scores)[1] || 0}</strong>
            </p>
            <button 
              onClick={() => router.push(`/internal/contests/rooms/${roomId}/result`)}
              className="w-full py-2 bg-surface-variant hover:bg-outline-variant text-on-surface rounded-lg font-label-sm text-label-sm transition-colors border border-outline-variant"
            >
              View Match Results
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
