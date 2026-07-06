"use client";

import { useState, useEffect } from "react";
import {
  registerForContest,
  getAvailableTeamsForContest,
} from "@/lib/actions/contests";
import { useRouter } from "next/navigation";
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
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"solo" | "new" | "existing">(
    teamSize === 1 ? "solo" : "new",
  );
  const [teamName, setTeamName] = useState("");
  const [availableTeams, setAvailableTeams] = useState<
    { teamName: string; memberCount: number; maxCapacity: number }[]
  >([]);
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
      getAvailableTeamsForContest(contestId)
        .then((teams) => {
          setAvailableTeams(teams);
          setLoadingTeams(false);
        })
        .catch((err) => {
          console.error(err);
          setLoadingTeams(false);
        });
    }
  }, [isOpen, contestId, teamSize, viewOnly]);

  useEffect(() => {
    if (isOpen) {
      setLoadingRegistrations(true);
      import("@/lib/actions/contests")
        .then(({ getContestRegistrations }) => {
          getContestRegistrations(contestId)
            .then((res) => {
              if (res.success) {
                setRegistrations(res.registrations || []);
                setFormat(res.format || "unknown");
                setIsDeadlinePassed(res.isDeadlinePassed || false);
                setRegistrationType(res.registrationType || "open");
              }
              setLoadingRegistrations(false);
            })
            .catch((err) => {
              console.error(err);
              setLoadingRegistrations(false);
            });
        })
        .catch((err) => {
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
    if (loadingRegistrations)
      return (
        <div className={styles.regLoading}>
          <div className={styles.spinner}></div>
          Loading registrations...
        </div>
      );
    if (registrations.length === 0)
      return (
        <div className={styles.regEmpty}>
          No one has registered yet. Be the first!
        </div>
      );

    if (format === "1v1" || format === "solo-tournament" || teamSize === 1) {
      return (
        <div className={styles.regList}>
          {registrations.map((reg, i) => (
            <div key={i} className={styles.regItem}>
              <div className={styles.avatar}>
                {reg.image ? (
                  <img
                    src={reg.image}
                    alt={reg.cfHandle}
                    className={styles.avatarImg}
                  />
                ) : (
                  <span
                    className={`material-symbols-outlined ${styles.icon18}`}
                  >
                    person
                  </span>
                )}
              </div>
              <span className={styles.regName}>
                {reg.teamName || reg.cfHandle}
              </span>
            </div>
          ))}
        </div>
      );
    } else {
      const teams: Record<string, any[]> = {};
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
                  <span
                    className={`material-symbols-outlined ${styles.icon16}`}
                  >
                    groups
                  </span>
                  {tName}
                </span>
                <span className={styles.teamCount}>
                  {members.length}/{teamSize}
                </span>
              </div>
              <div className={styles.memberChips}>
                {members.map((m, j) => (
                  <span key={j} className={styles.memberChip}>
                    {m.image ? (
                      <img
                        src={m.image}
                        alt={m.cfHandle}
                        className={styles.memberChipImg}
                      />
                    ) : (
                      <span
                        className={`material-symbols-outlined ${styles.memberChipIcon}`}
                      >
                        account_circle
                      </span>
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
    <div className={styles.overlay} onClick={onClose}>
      {/* Modal Container */}
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {/* Accent line */}
        <div className={styles.accentLine}></div>

        {/* Header */}
        <div className={styles.header}>
          <h2>{viewOnly ? "Contest Registrations" : "Register for Contest"}</h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className={styles.closeBtn}
            type="button"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className={styles.body}>
          {/* Current Registrations Display */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <span className={`material-symbols-outlined ${styles.icon18}`}>
                format_list_bulleted
              </span>
              Current Registrations
            </h3>
            {renderRegistrations()}
          </div>

          {/* Body / Form Fields */}
          {!viewOnly && (
            <form
              id="register-contest-form"
              onSubmit={handleSubmit}
              className={styles.form}
            >
              <div className={styles.divider}></div>
              {teamSize > 1 ? (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Registration Mode</span>
                  <div className={styles.radioGroup}>
                    {/* Option: Create New Team */}
                    <label className={styles.radioLabel}>
                      <input
                        className={styles.radio}
                        name="registration_mode"
                        type="radio"
                        value="new"
                        checked={mode === "new"}
                        onChange={() => setMode("new")}
                      />
                      <div className={styles.radioDot}></div>
                      <span className={styles.radioText}>Create New Team</span>
                    </label>

                    {/* Option: Join Existing */}
                    <label className={styles.radioLabel}>
                      <input
                        className={styles.radio}
                        name="registration_mode"
                        type="radio"
                        value="existing"
                        checked={mode === "existing"}
                        onChange={() => setMode("existing")}
                      />
                      <div className={styles.radioDot}></div>
                      <span className={styles.radioText}>Join Existing</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className={styles.soloNote}>
                  You are registering as a Solo player.
                </div>
              )}

              {/* Team Name Text Input */}
              {!["1v1", "solo-tournament"].includes(format) && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="team_name">
                    {mode === "existing"
                      ? "Team Name to Join"
                      : teamSize === 1
                        ? "Your Display Name"
                        : "New Team Name"}
                  </label>
                  <div className={styles.inputWrap}>
                    {mode === "existing" ? (
                      <>
                        <span
                          className={`material-symbols-outlined ${styles.inputIcon}`}
                        >
                          group
                        </span>
                        <select
                          className={styles.select}
                          id="team_name"
                          name="team_name"
                          required={
                            !["1v1", "solo-tournament"].includes(format)
                          }
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                        >
                          <option value="" disabled>
                            Select a team to join
                          </option>
                          {loadingTeams ? (
                            <option value="" disabled>
                              Loading teams...
                            </option>
                          ) : availableTeams.length === 0 ? (
                            <option value="" disabled>
                              No available teams to join
                            </option>
                          ) : (
                            availableTeams.map((t) => (
                              <option key={t.teamName} value={t.teamName}>
                                {t.teamName} ({t.memberCount}/{t.maxCapacity}{" "}
                                members)
                              </option>
                            ))
                          )}
                        </select>
                        <span
                          className={`material-symbols-outlined ${styles.dropIcon}`}
                        >
                          arrow_drop_down
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          className={`material-symbols-outlined ${styles.inputIcon}`}
                        >
                          terminal
                        </span>
                        <input
                          className={styles.input}
                          id="team_name"
                          name="team_name"
                          placeholder={
                            teamSize === 1
                              ? "e.g. Code Ninja"
                              : "e.g. Null Pointers"
                          }
                          required={
                            !["1v1", "solo-tournament"].includes(format)
                          }
                          type="text"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
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
        <div className={styles.footer}>
          {viewOnly ? (
            <>
              {!isDeadlinePassed && registrationType !== "closed" && (
                <button
                  className={styles.btnDanger}
                  type="button"
                  onClick={handleUnregister}
                  disabled={loading}
                >
                  {loading ? "Leaving..." : "Leave Contest"}
                </button>
              )}
              <button
                className={styles.btnPrimary}
                type="button"
                onClick={onClose}
              >
                Close
              </button>
            </>
          ) : (
            <>
              <div></div> {/* spacer */}
              <div className={styles.footerActions}>
                <button
                  className={styles.btnGhost}
                  type="button"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className={styles.btnPrimary}
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
  );
}
