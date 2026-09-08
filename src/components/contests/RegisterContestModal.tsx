"use client";

import {
  ChevronDown,
  CircleUserRound,
  List,
  Terminal,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  registerForContest,
  getAvailableTeamsForContest,
  getContestRegistrations,
  unregisterFromContest,
  requestToJoinContestTeam,
} from "@/lib/actions/contests";
import type { ContestRegistrationDto } from "@/lib/contests/dtos";

import CompatibleImage from "@/components/shared/CompatibleImage";
import Modal from "@/components/shared/Modal";
import UserAvatar from "@/components/shared/UserAvatar";
import { useToast } from "@/components/shared/Toast";
import { useConfirm } from "@/components/shared/useConfirm";

import styles from "./RegisterContestModal.module.scss";

export default function RegisterContestModal({
  isOpen,
  onClose,
  contestId,
  teamSize,
  viewOnly = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  contestId: string;
  teamSize: number;
  viewOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"solo" | "new" | "existing">(
    teamSize === 1 ? "solo" : "new",
  );
  const [teamName, setTeamName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [availableTeams, setAvailableTeams] = useState<
    { teamName: string; memberCount: number; maxCapacity: number; isPublic?: boolean; requiresJoinCode?: boolean; leaderId?: string; teamId?: string }[]
  >([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [registrations, setRegistrations] = useState<ContestRegistrationDto[]>([]);
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
      getAvailableTeamsForContest(contestId)
        .then((result) => {
          if (result.ok) setAvailableTeams(result.data);
          setLoadingTeams(false);
        })
        .catch(() => { setLoadingTeams(false); });
    }
  }, [isOpen, contestId, teamSize, viewOnly]);

  useEffect(() => {
    if (isOpen) {
      setLoadingRegistrations(true);
      getContestRegistrations(contestId)
        .then((res) => {
          if (res.ok) {
            setRegistrations((res as any).data.registrations || []);
            setFormat((res as any).data.format || "unknown");
            setIsDeadlinePassed((res as any).data.isDeadlinePassed || false);
            setRegistrationType((res as any).data.registrationType || "open");
          }
          setLoadingRegistrations(false);
        })
        .catch(() => { setLoadingRegistrations(false); });
    }
  }, [isOpen, contestId]);

  if (!isOpen) return null;

  const selectedTeamInfo = mode === "existing" ? availableTeams.find(t => t.teamName === teamName) : undefined;
  const isPrivateTeamSelected = selectedTeamInfo?.requiresJoinCode === true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isSoloFormat = ["1v1", "solo-tournament"].includes(format);
    if (!isSoloFormat && !teamName.trim()) {
      toast.error("Please provide a team name.");
      return;
    }

    setLoading(true);
    try {
      const res = await registerForContest(contestId, teamName, mode === "new" ? isPublic : undefined, joinCode || undefined);
      if (res.ok) {
        toast.success("Registered successfully!");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Error registering");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestToJoin = async () => {
    if (!selectedTeamInfo?.teamId) return;
    setLoading(true);
    try {
      const res = await requestToJoinContestTeam(contestId, selectedTeamInfo.teamId);
      if (res.ok) {
        toast.success("Join request sent! The team leader will review it.");
        onClose();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Error sending request");
    } finally {
      setLoading(false);
    }
  };

  const handleUnregister = async () => {
    const confirmed = await confirm({
      title: "Leave this contest?",
      description: "Your registration will be withdrawn. You can register again while registration stays open.",
      confirmLabel: "Leave contest",
    });
    if (!confirmed) return;
    setLoading(true);
    try {
      const res = await unregisterFromContest(contestId);
      if (res.ok) {
        toast.success("Successfully unregistered!");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Error unregistering");
    } finally {
      setLoading(false);
    }
  };

  const renderRegistrations = () => {
    if (loadingRegistrations)
      return (
        <div className={styles.regLoading}>
          <div className={styles.spinner}></div>
          Loading registrations...
        </div>
      );
    if (registrations.length === 0)
      return <div className={styles.regEmpty}>No one has registered yet. Be the first!</div>;

    if (format === "1v1" || format === "solo-tournament" || teamSize === 1) {
      return (
        <div className={styles.regList}>
          {registrations.map((reg, i) => (
            <div key={i} className={styles.regItem}>
              <UserAvatar name={reg.teamName || reg.cfHandle} image={reg.image} size={32} />
              <span className={styles.regName}>{reg.teamName || reg.cfHandle}</span>
            </div>
          ))}
        </div>
      );
    } else {
      const teams: Record<string, ContestRegistrationDto[]> = {};
      registrations.forEach((r) => {
        if (!teams[r.teamName]) teams[r.teamName] = [];
        teams[r.teamName].push(r);
      });
      return (
        <div className={`${styles.regList} ${styles.teamList}`}>
          {Object.entries(teams).map(([tName, members], i) => (
            <div key={i} className={styles.teamCard}>
              <div className={styles.teamHeader}>
                <span className={styles.teamHeaderName}>
                  <Users className={styles.icon16} size={16} />
                  {tName}
                </span>
                <span className={styles.teamCount}>{members.length}/{teamSize}</span>
              </div>
              <div className={styles.memberChips}>
                {members.map((m, j) => (
                  <span key={j} className={styles.memberChip}>
                    {m.image ? (
                      <CompatibleImage src={m.image} alt={m.cfHandle} className={styles.memberChipImg} width={16} height={16} />
                    ) : (
                      <CircleUserRound className={styles.memberChipIcon} size={12} />
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

  const registerLabel = loading ? "Registering..." : "Register";

  const footer = viewOnly ? (
    <>
      {!isDeadlinePassed && registrationType !== "closed" && (
        <button className={styles.btnDanger} type="button" onClick={handleUnregister} disabled={loading}>
          {loading ? "Leaving..." : "Leave Contest"}
        </button>
      )}
      <button className={styles.btnPrimary} type="button" onClick={onClose} disabled={loading}>Close</button>
    </>
  ) : (
    <>
      <button className={styles.btnGhost} type="button" onClick={onClose} disabled={loading}>Cancel</button>
      <button className={styles.btnPrimary} type="submit" form="register-contest-form" disabled={loading}>
        {registerLabel}
      </button>
    </>
  );

  return (
    <>
      <Modal
        kicker="Contests"
        title={viewOnly ? "Contest registrations" : "Register for contest"}
        onClose={onClose}
        closeDisabled={loading}
        maxWidth={448}
        contentClassName={styles.body}
        footer={footer}
      >
        <div>
          {/* Current Registrations Display */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <List className={styles.icon18} size={18} />
              Current Registrations
            </h3>
            {renderRegistrations()}
          </div>

          {/* Body / Form Fields */}
          {!viewOnly && (
            <form id="register-contest-form" onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.divider}></div>
              {teamSize > 1 ? (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Registration Mode</span>
                  <div className={styles.radioGroup}>
                    <label className={styles.radioLabel}>
                      <input className={styles.radio} name="registration_mode" type="radio" value="new" checked={mode === "new"} onChange={() => setMode("new")} />
                      <div className={styles.radioDot}></div>
                      <span className={styles.radioText}>Create New Team</span>
                    </label>
                    <label className={styles.radioLabel}>
                      <input className={styles.radio} name="registration_mode" type="radio" value="existing" checked={mode === "existing"} onChange={() => setMode("existing")} />
                      <div className={styles.radioDot}></div>
                      <span className={styles.radioText}>Join Existing</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className={styles.soloNote}>You are registering as a Solo player.</div>
              )}

              {/* Team Name Input */}
              {teamSize > 1 && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="team_name">
                    {mode === "existing" ? "Team Name to Join" : teamSize === 1 ? "Your Display Name" : "New Team Name"}
                  </label>
                  <div className={styles.inputWrap}>
                    {mode === "existing" ? (
                      <>
                        <Users className={styles.inputIcon} size={18} />
                        <select
                          className={styles.select}
                          id="team_name"
                          name="team_name"
                          required={!["1v1", "solo-tournament"].includes(format)}
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                        >
                          <option value="" disabled>Select a team to join</option>
                          {loadingTeams ? (
                            <option value="" disabled>Loading teams...</option>
                          ) : availableTeams.length === 0 ? (
                            <option value="" disabled>No available teams to join</option>
                          ) : (
                            availableTeams.map((t) => (
                              <option key={t.teamName} value={t.teamName}>
                                {t.teamName} ({t.memberCount}/{t.maxCapacity} members){t.requiresJoinCode ? " 🔒 Private" : ""}
                              </option>
                            ))
                          )}
                        </select>
                        <ChevronDown className={styles.dropIcon} size={18} />
                      </>
                    ) : (
                      <>
                        <Terminal className={styles.inputIcon} size={18} />
                        <input
                          className={styles.input}
                          id="team_name"
                          name="team_name"
                          placeholder={teamSize === 1 ? "Eg. Code Ninja" : "Eg. Null Pointers"}
                          required={!["1v1", "solo-tournament"].includes(format)}
                          type="text"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Privacy / Join Code Inputs for New Teams */}
              {mode === "new" && teamSize > 1 && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Team Privacy</label>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <input type="checkbox" id="is_public" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
                    <label htmlFor="is_public" style={{ fontSize: "0.9rem" }}>Make team public (anyone can join directly)</label>
                  </div>
                  {!isPublic && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <label className={styles.fieldLabel} style={{ fontSize: "0.85rem" }}>Custom Join Code (Optional - leave blank to auto-generate)</label>
                      <input
                        type="text"
                        placeholder="Enter 6-digit code or leave blank"
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value)}
                        className={styles.input}
                        maxLength={6}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Private team: both options — enter code or send request */}
              {mode === "existing" && teamName && isPrivateTeamSelected && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>🔒 Private Team — Join Options</label>
                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.3rem" }}>Enter join code (join directly):</label>
                    <input
                      type="text"
                      placeholder="Enter 6-digit join code"
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value)}
                      className={styles.input}
                      maxLength={6}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                    <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground, #888)" }}>or</span>
                    <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  </div>
                  <button
                    type="button"
                    onClick={handleRequestToJoin}
                    disabled={loading}
                    className={styles.btnGhost}
                    style={{ marginTop: "0.75rem", width: "100%" }}
                  >
                    {loading ? "Sending..." : "Request to Join (no code)"}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </Modal>
      {confirmDialog}
    </>
  );
}
