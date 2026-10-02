"use client";

import React, { useState, useEffect } from "react";
import { Check, X, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  getContestTeamRequests,
  respondToContestTeamRequest,
  inviteToContestTeam,
} from "@/lib/actions/contests";
import type { ContestTeamRequestDto } from "@/lib/contests/dtos";

import Button from "@/components/shared/Button";
import Modal from "@/components/shared/Modal";
import { useToast } from "@/components/shared/Toast";

import styles from "./ManageTeamModal.module.scss";

interface ManageTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  contestId: string;
  teamId: string;
  teamName: string;
  isLeader: boolean;
}

export default function ManageTeamModal({
  isOpen,
  onClose,
  contestId,
  teamId,
  teamName,
  isLeader,
}: ManageTeamModalProps) {
  const toast = useToast();
  const router = useRouter();
  const [requests, setRequests] = useState<ContestTeamRequestDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteHandle, setInviteHandle] = useState("");

  const fetchRequests = React.useCallback(async () => {
    if (!teamId) return;

    setLoading(true);

    try {
      const res = await getContestTeamRequests(teamId);

      if (res.ok) {
        setRequests(res.data);
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error("Failed to load team requests");
    } finally {
      setLoading(false);
    }
  }, [teamId, toast]);

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
        await fetchRequests();
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    } catch {
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
      const res = await inviteToContestTeam(
        contestId,
        teamId,
        inviteHandle.trim(),
      );

      if (res.ok) {
        toast.success("Invite sent successfully");
        setInviteHandle("");
        await fetchRequests();
      } else {
        toast.error(res.error.message);
      }
    } catch {
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
      <div className={styles.body}>
        {isLeader && (
          <>
            <section>
              <h3 className={styles.heading}>
                Pending Join Requests ({joinRequests.length})
              </h3>
              {joinRequests.length === 0 ? (
                <p className={styles.hint}>No pending join requests.</p>
              ) : (
                <div className={styles.list}>
                  {joinRequests.map((req) => (
                    <div key={req._id} className={styles.request}>
                      <span>
                        <strong>{req.fromUserHandle || req.fromUserId}</strong>{" "}
                        wants to join
                      </span>
                      <div className={styles.actions}>
                        <Button
                          size="small"
                          variant="primary"
                          onClick={() => handleRespond(req._id, "accept")}
                          disabled={loading}
                        >
                          <Check size={14} /> Accept
                        </Button>
                        <Button
                          size="small"
                          variant="danger"
                          onClick={() => handleRespond(req._id, "reject")}
                          disabled={loading}
                        >
                          <X size={14} /> Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {sentInvites.length > 0 && (
              <section>
                <h3 className={styles.heading}>
                  Pending Invites ({sentInvites.length})
                </h3>
                <div className={styles.list}>
                  {sentInvites.map((req) => (
                    <div key={req._id} className={styles.request}>
                      <span>
                        Invited:{" "}
                        <strong>{req.toUserHandle || req.toUserId}</strong>
                      </span>
                      <span className={styles.hint}>Awaiting response</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <form onSubmit={handleInvite}>
              <label htmlFor="team-invite-handle" className={styles.heading}>
                Invite by Codeforces handle
              </label>
              <div className={styles.inviteRow}>
                <input
                  id="team-invite-handle"
                  type="text"
                  placeholder="Codeforces handle"
                  value={inviteHandle}
                  onChange={(e) => setInviteHandle(e.target.value)}
                  className={styles.input}
                  disabled={loading}
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading || !inviteHandle.trim()}
                >
                  <UserPlus size={16} /> Send Invite
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}
