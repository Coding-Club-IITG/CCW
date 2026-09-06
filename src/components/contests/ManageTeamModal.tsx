"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/shared/Modal";
import { Check, X, UserPlus, Shield } from "lucide-react";
import {
  getContestTeamRequests,
  respondToContestTeamRequest,
  inviteToContestTeam,
} from "@/lib/actions/contests";
import { useToast } from "@/components/shared/Toast";
import { useRouter } from "next/navigation";
import styles from "./RegisterContestModal.module.scss";

interface ManageTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  contestId: string;
  teamId: string;
  teamName: string;
  isLeader: boolean;
  joinCode?: string;
}

export default function ManageTeamModal({
  isOpen,
  onClose,
  contestId,
  teamId,
  teamName,
  isLeader,
  joinCode,
}: ManageTeamModalProps) {
  const toast = useToast();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteHandle, setInviteHandle] = useState("");

  const fetchRequests = React.useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await getContestTeamRequests(teamId);
      if (res.ok) {
        setRequests(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (isOpen && isLeader && teamId) {
      fetchRequests();
    }
  }, [isOpen, teamId, isLeader, fetchRequests]);

  const handleRespond = async (reqId: string, action: "accept" | "reject") => {
    setLoading(true);
    try {
      const res = await respondToContestTeamRequest(reqId, action);
      if (res.ok) {
        toast.success(`Request ${action}ed`);
        fetchRequests();
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    } catch (e) {
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteHandle.trim()) return;

    setLoading(true);
    try {
      const res = await inviteToContestTeam(contestId, teamId, inviteHandle.trim());
      if (res.ok) {
        toast.success("Invite sent successfully");
        setInviteHandle("");
        fetchRequests();
      } else {
        toast.error(res.error.message);
      }
    } catch (e) {
      toast.error("Failed to send invite");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const joinRequests = requests.filter((r) => r.type === "join_request");
  const sentInvites = requests.filter((r) => r.type === "invite");

  return (
    <Modal
      title={`Manage Team: ${teamName}`}
      onClose={onClose}
      closeDisabled={loading}
      maxWidth={500}
    >
      <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Join Code Display */}
        {isLeader && joinCode && (
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--card-bg, #f8f9fa)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <Shield size={18} />
              <strong>Private Team Code</strong>
            </div>
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              Share this code with members:{" "}
              <strong style={{ fontSize: "1.3rem", letterSpacing: "4px" }}>{joinCode}</strong>
            </p>
          </div>
        )}

        {/* Pending Join Requests */}
        {isLeader && (
          <div>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", marginTop: 0 }}>
              Pending Join Requests ({joinRequests.length})
            </h3>
            {joinRequests.length === 0 ? (
              <p style={{ color: "var(--muted-foreground, #888)", fontSize: "0.9rem", margin: 0 }}>
                No pending join requests.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {joinRequests.map((req) => (
                  <div
                    key={req._id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                    }}
                  >
                    <span style={{ fontSize: "0.9rem" }}>
                      <strong>{req.fromUserHandle || req.fromUserId}</strong> wants to join
                    </span>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => handleRespond(req._id, "accept")}
                        disabled={loading}
                        style={{
                          background: "#4caf50",
                          color: "white",
                          border: "none",
                          padding: "0.35rem 0.75rem",
                          borderRadius: "4px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        <Check size={14} /> Accept
                      </button>
                      <button
                        onClick={() => handleRespond(req._id, "reject")}
                        disabled={loading}
                        style={{
                          background: "#f44336",
                          color: "white",
                          border: "none",
                          padding: "0.35rem 0.75rem",
                          borderRadius: "4px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sent Invites */}
        {isLeader && sentInvites.length > 0 && (
          <div>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", marginTop: 0 }}>
              Pending Invites ({sentInvites.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {sentInvites.map((req) => (
                <div
                  key={req._id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                  }}
                >
                  <span style={{ fontSize: "0.9rem" }}>
                    Invited: <strong>{req.toUserHandle || req.toUserId}</strong>
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "#888", fontStyle: "italic" }}>
                    Awaiting response
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invite by Codeforces Handle */}
        {isLeader && (
          <div>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", marginTop: 0 }}>
              Invite Member by CF Handle
            </h3>
            <form onSubmit={handleInvite} style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                placeholder="Enter Codeforces Handle"
                value={inviteHandle}
                onChange={(e) => setInviteHandle(e.target.value)}
                className={styles.input}
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                disabled={loading || !inviteHandle.trim()}
                className={styles.btnPrimary}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap" }}
              >
                <UserPlus size={16} /> Send Invite
              </button>
            </form>
          </div>
        )}
      </div>
    </Modal>
  );
}

