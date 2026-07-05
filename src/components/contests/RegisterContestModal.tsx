"use client";

import { useState, useEffect } from "react";
import { registerForContest, getAvailableTeamsForContest } from "@/lib/actions/contests";
import { useRouter } from "next/navigation";

export default function RegisterContestModal({ isOpen, onClose, contestId, teamSize, viewOnly = false }: { isOpen: boolean; onClose: () => void; contestId: string; teamSize: number; viewOnly?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"solo" | "new" | "existing">(teamSize === 1 ? "solo" : "new");
  const [teamName, setTeamName] = useState("");
  const [availableTeams, setAvailableTeams] = useState<{ teamName: string; memberCount: number; maxCapacity: number }[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [format, setFormat] = useState<string>("unknown");
  const [isDeadlinePassed, setIsDeadlinePassed] = useState(false);
  const [registrationType, setRegistrationType] = useState<string>("open");

  useEffect(() => {
    if (isOpen) {
      setMode(teamSize === 1 ? "solo" : "new");
    }
  }, [isOpen, teamSize]);

  useEffect(() => {
    if (isOpen && teamSize > 1 && !viewOnly) {
      setLoadingTeams(true);
      getAvailableTeamsForContest(contestId).then(teams => {
        setAvailableTeams(teams);
        setLoadingTeams(false);
      }).catch(err => {
        console.error(err);
        setLoadingTeams(false);
      });
    }
  }, [isOpen, contestId, teamSize, viewOnly]);

  useEffect(() => {
    if (isOpen) {
      setLoadingRegistrations(true);
      import("@/lib/actions/contests").then(({ getContestRegistrations }) => {
        getContestRegistrations(contestId).then(res => {
          if (res.success) {
            setRegistrations(res.registrations || []);
            setFormat(res.format || "unknown");
            setIsDeadlinePassed(res.isDeadlinePassed || false);
            setRegistrationType(res.registrationType || "open");
          }
          setLoadingRegistrations(false);
        }).catch(err => {
          console.error(err);
          setLoadingRegistrations(false);
        });
      }).catch(err => {
        console.error(err);
        setLoadingRegistrations(false);
      });
    }
  }, [isOpen, contestId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isSoloFormat = ["1v1", "solo-tournament"].includes(format);
    if (!isSoloFormat && !teamName.trim()) {
      alert("Please provide a team name.");
      return;
    }

    setLoading(true);
    try {
      const res = await registerForContest(contestId, teamName);
      if (res.success) {
        alert("Registered successfully!");
        onClose();
        router.refresh();
      } else {
        alert(res.message || "Error registering");
      }
    } catch (err) {
      alert("Error registering");
    } finally {
      setLoading(false);
    }
  };

  const handleUnregister = async () => {
    if (!confirm("Are you sure you want to leave this contest?")) return;
    setLoading(true);
    try {
      const { unregisterFromContest } = await import("@/lib/actions/contests");
      const res = await unregisterFromContest(contestId);
      if (res.success) {
        alert("Successfully unregistered!");
        onClose();
        router.refresh();
      } else {
        alert(res.message || "Failed to unregister");
      }
    } catch (e) {
      alert("Error unregistering");
    } finally {
      setLoading(false);
    }
  };

  const renderRegistrations = () => {
    if (loadingRegistrations) return <div className="text-sm text-on-surface-variant flex items-center gap-2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>Loading registrations...</div>;
    if (registrations.length === 0) return <div className="text-sm text-on-surface-variant p-4 text-center border border-dashed border-outline-variant rounded">No one has registered yet. Be the first!</div>;

    if (format === "1v1" || format === "solo-tournament" || teamSize === 1) {
      return (
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          {registrations.map((reg, i) => (
            <div key={i} className="flex items-center gap-3 p-3 border border-outline-variant rounded bg-surface-container-low hover:border-primary/30 transition-colors">
              <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center shrink-0 overflow-hidden">
                {reg.image ? (
                  <img src={reg.image} alt={reg.cfHandle} className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
                )}
              </div>
              <span className="text-sm text-on-surface font-medium">{reg.teamName || reg.cfHandle}</span>
            </div>
          ))}
        </div>
      );
    } else {
      const teams: Record<string, any[]> = {};
      registrations.forEach(r => {
        if (!teams[r.teamName]) teams[r.teamName] = [];
        teams[r.teamName].push(r);
      });
      return (
        <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
          {Object.entries(teams).map(([tName, members], i) => (
            <div key={i} className="border border-outline-variant rounded p-3 bg-surface-container-low hover:border-primary/30 transition-colors">
              <div className="text-sm font-bold text-primary mb-3 flex items-center justify-between border-b border-outline-variant/30 pb-2">
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">groups</span>
                  {tName}
                </span>
                <span className="text-xs text-on-surface-variant bg-surface px-2 py-0.5 rounded border border-outline-variant/50">
                  {members.length}/{teamSize}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {members.map((m, j) => (
                  <span key={j} className="text-xs text-on-surface px-2.5 py-1.5 bg-surface-container-high rounded border border-outline-variant/50 flex items-center gap-1.5">
                    {m.image ? (
                      <img src={m.image} alt={m.cfHandle} className="w-4 h-4 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="material-symbols-outlined text-[12px] opacity-50 shrink-0">account_circle</span>
                    )}
                    {m.cfHandle}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
  };

  return (
    <>
      <style>{`
        /* Custom radio button styling */
        .cyber-radio:checked + div {
            background-color: #88d982;
            border-color: #88d982;
            box-shadow: 0 0 8px rgba(136, 217, 130, 0.5);
        }
        .cyber-radio:checked + div::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background-color: #131313;
        }
      `}</style>

      {/* Modal Overlay - grayed out background, no grid */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-grayscale flex items-center justify-center p-margin-mobile md:p-margin-desktop"
        style={{ zIndex: 9999 }}
        onClick={onClose}
      >
        {/* Modal Container */}
        <div
          className="relative w-full max-w-md bg-surface-container border border-outline-variant rounded-lg shadow-2xl flex flex-col overflow-hidden ring-1 ring-primary/10"
          style={{ maxWidth: '448px', zIndex: 10000 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cybernetic top accent line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-70"></div>

          {/* Header */}
          <div className="flex justify-between items-center px-gutter py-4 border-b border-outline-variant/60 bg-surface-container-high/30">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
              {viewOnly ? "Contest Registrations" : "Register for Contest"}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="text-on-surface-variant hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-DEFAULT p-1"
              type="button"
            >
              <span className="material-symbols-outlined block">close</span>
            </button>
          </div>

          <div className="flex flex-col p-gutter max-h-[80vh] overflow-y-auto">
            {/* Current Registrations Display */}
            <div className="mb-6">
              <h3 className="font-label-sm text-primary mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">format_list_bulleted</span>
                Current Registrations
              </h3>
              {renderRegistrations()}
            </div>

            {/* Body / Form Fields */}
            {!viewOnly && (
              <form id="register-contest-form" onSubmit={handleSubmit} className="flex flex-col gap-gutter">
                <div className="border-t border-outline-variant/30 pt-6"></div>
            {teamSize > 1 ? (
              <div className="flex flex-col gap-unit">
                <span className="font-label-sm text-label-sm text-primary">Registration Mode</span>
                <div className="flex flex-col gap-2 mt-1">
                  {/* Option: Create New Team */}
                  <label className="relative flex items-center gap-3 p-3 border border-outline-variant rounded-DEFAULT cursor-pointer hover:border-primary/50 hover:bg-surface-container-high transition-all has-[:checked]:border-primary has-[:checked]:bg-primary-container/10">
                    <input
                      className="cyber-radio sr-only"
                      name="registration_mode"
                      type="radio"
                      value="new"
                      checked={mode === "new"}
                      onChange={() => setMode("new")}
                    />
                    <div className={`relative w-4 h-4 rounded-full border flex-shrink-0 transition-colors flex items-center justify-center ${mode === "new" ? "border-primary" : "border-outline-variant"}`}>
                      {mode === "new" && <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(136,217,130,0.6)]" />}
                    </div>
                    <span className="font-body-md text-body-md text-on-surface">Create New Team</span>
                  </label>

                  {/* Option: Join Existing */}
                  <label className="relative flex items-center gap-3 p-3 border border-outline-variant rounded-DEFAULT cursor-pointer hover:border-primary/50 hover:bg-surface-container-high transition-all has-[:checked]:border-primary has-[:checked]:bg-primary-container/10">
                    <input
                      className="cyber-radio sr-only"
                      name="registration_mode"
                      type="radio"
                      value="existing"
                      checked={mode === "existing"}
                      onChange={() => setMode("existing")}
                    />
                    <div className={`relative w-4 h-4 rounded-full border flex-shrink-0 transition-colors flex items-center justify-center ${mode === "existing" ? "border-primary" : "border-outline-variant"}`}>
                      {mode === "existing" && <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(136,217,130,0.6)]" />}
                    </div>
                    <span className="font-body-md text-body-md text-on-surface">Join Existing</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="font-body-md text-body-md text-on-surface-variant opacity-80 mb-2">You are registering as a Solo player.</div>
            )}

            {/* Team Name Text Input */}
            {!["1v1", "solo-tournament"].includes(format) && (
              <div className="flex flex-col gap-unit">
                <label className="font-label-sm text-label-sm text-primary" htmlFor="team_name">
                  {mode === "existing" ? "Team Name to Join" : (teamSize === 1 ? "Your Display Name" : "New Team Name")}
                </label>
                <div className="relative mt-1">
                  {mode === "existing" ? (
                    <>
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 pointer-events-none z-10">group</span>
                      <select
                        className="w-full bg-background border border-outline-variant rounded-DEFAULT py-3 pl-10 pr-3 font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-all appearance-none cursor-pointer"
                        id="team_name"
                        name="team_name"
                        required={!["1v1", "solo-tournament"].includes(format)}
                        value={teamName}
                        onChange={e => setTeamName(e.target.value)}
                      >
                        <option value="" disabled>Select a team to join</option>
                        {loadingTeams ? (
                          <option value="" disabled>Loading teams...</option>
                        ) : availableTeams.length === 0 ? (
                          <option value="" disabled>No available teams to join</option>
                        ) : (
                          availableTeams.map(t => (
                            <option key={t.teamName} value={t.teamName}>
                              {t.teamName} ({t.memberCount}/{t.maxCapacity} members)
                            </option>
                          ))
                        )}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 pointer-events-none z-10">arrow_drop_down</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 pointer-events-none z-10">terminal</span>
                      <input
                        className="w-full bg-background border border-outline-variant rounded-DEFAULT py-3 pl-10 pr-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-all"
                        id="team_name"
                        name="team_name"
                        placeholder={teamSize === 1 ? "e.g. Code Ninja" : "e.g. Null Pointers"}
                        required={!["1v1", "solo-tournament"].includes(format)}
                        type="text"
                        value={teamName}
                        onChange={e => setTeamName(e.target.value)}
                      />
                    </>
                  )}
                </div>
              </div>
            )}
          </form>
          )}
        </div>

          {/* Footer / Actions */}
          <div className="flex justify-between items-center gap-4 px-gutter py-4 bg-surface-container-highest border-t border-outline-variant/60">
            {viewOnly ? (
              <>
                {!isDeadlinePassed && registrationType !== "closed" && (
                  <button
                    className="px-4 py-2 rounded-DEFAULT font-label-sm text-label-sm text-error/80 border border-error/30 hover:bg-error/10 hover:text-error transition-all focus:outline-none disabled:opacity-50"
                    type="button"
                    onClick={handleUnregister}
                    disabled={loading}
                  >
                    {loading ? "Leaving..." : "Leave Contest"}
                  </button>
                )}
                <button
                  className="px-6 py-2 rounded-DEFAULT bg-primary-container text-on-primary-container font-label-sm text-label-sm border border-primary/20 hover:bg-primary hover:text-on-primary transition-all focus:outline-none"
                  type="button"
                  onClick={onClose}
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <div></div> {/* spacer */}
                <div className="flex items-center gap-3">
                  <button
                    className="px-4 py-2 rounded-DEFAULT font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors focus:outline-none focus:ring-2 focus:ring-outline-variant"
                    type="button"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-6 py-2 rounded-DEFAULT bg-primary-container text-on-primary-container font-label-sm text-label-sm border border-primary/20 hover:bg-primary hover:text-on-primary transition-all shadow-[0_0_15px_rgba(136,217,130,0.1)] hover:shadow-[0_0_20px_rgba(136,217,130,0.3)] focus:outline-none disabled:opacity-50"
                    type="submit"
                    form="register-contest-form"
                    disabled={loading}
                  >
                    {loading ? "Registering..." : "Register"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}