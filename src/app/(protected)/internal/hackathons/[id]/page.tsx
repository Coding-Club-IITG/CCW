"use client";

import {
  Users as IconUsers,
  CalendarDays as IconCalendar,
  ExternalLink as IconExternalLink,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { appErrorMessage, expectAppData } from "@/lib/api/result";
import { useSession } from "@/lib/auth-client";
import { formatDate, getDisplayName } from "@/lib/utils";

import BackLink from "@/components/shared/BackLink";
import CompatibleImage from "@/components/shared/CompatibleImage";
import { ListSkeletonContent } from "@/components/shared/skeletons/ListSkeleton";
import { useToast } from "@/components/shared/Toast";
import UserSearch, { UserSearchItem } from "@/components/shared/UserSearch";
import { useConfirm } from "@/components/shared/useConfirm";

import styles from "../Hackathons.module.scss";

interface MemberDetail {
  id: string;
  name: string;
  pizza_count?: number;
}

interface Team {
  _id: string;
  name: string;
  owner: string;
  members: string[];
  memberDetails: MemberDetail[];
  status: string;
  description: string;
}

interface Hackathon {
  _id: string;
  name: string;
  organization: string;
  minMembers: number;
  maxMembers: number;
  skills: string[];
  websiteUrl: string;
  ogImage: string;
  deadline: string;
  description: string;
}

interface HackathonRequest {
  _id: string;
  teamId: string;
  hackathonId: string;
  fromUserId: string;
  toUserId: string;
  type: string;
  status: string;
  createdAt: string;
}

async function searchHackathonUsers(query: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/hackathons/users?q=${encodeURIComponent(query)}`,
    { signal },
  );
  const data = await expectAppData<{
    items?: Array<{
      id: string;
      name: string;
      email: string;
      pizza_count: number;
    }>;
  }>(response);
  return (data.items || []).map((user) => ({
    id: user.id,
    name: getDisplayName(user.name, user.pizza_count),
    secondary: user.email,
  }));
}

export default function HackathonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { data: session } = useSession();
  const currentUserId = session?.user.id || "";
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [hackathonId, setHackathonId] = useState("");
  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create team form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit team
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Requests for my team (if I'm owner)
  const [pendingRequests, setPendingRequests] = useState<HackathonRequest[]>(
    [],
  );
  const [requestUsers, setRequestUsers] = useState<
    Record<string, { name: string; pizza_count: number }>
  >({});

  // Invite search
  const [inviting, setInviting] = useState<string | null>(null);

  // My pending invites
  const [myInvites, setMyInvites] = useState<HackathonRequest[]>([]);

  const fetchData = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/hackathons/${id}/teams`);
      const data = await expectAppData(res);
      setHackathon(data.hackathon);
      setTeams(data.teams || []);
    } catch {
      setError("Failed to load hackathon.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    params.then(({ id }) => {
      setHackathonId(id);
      fetchData(id);
    });
  }, [params, fetchData]);

  // Determine user's team from member lists
  useEffect(() => {
    if (!teams.length || !currentUserId) return;
    fetchMyRequests();
    // Load pending join requests if user owns a team
    const ownedTeam = teams.find((t) => t.owner === currentUserId);
    if (ownedTeam) {
      loadTeamRequests(ownedTeam._id);
    }
  }, [teams, currentUserId]);

  async function fetchMyRequests() {
    try {
      const res = await fetch("/api/hackathons/requests");
      const data = await expectAppData(res);
      setMyInvites(
        (data.items || []).filter(
          (r: HackathonRequest) =>
            r.type === "invite" && r.status === "pending",
        ),
      );
    } catch {
      // silent
    }
  }

  // Find the user's team for this hackathon
  const myTeam = teams.find((t) => t.members.includes(currentUserId));
  const isInTeam = !!myTeam;

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");

    try {
      const res = await fetch(`/api/hackathons/${hackathonId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName, description: teamDesc }),
      });

      await expectAppData(res);

      setTeamName("");
      setTeamDesc("");
      setShowCreateForm(false);
      fetchData(hackathonId);
    } catch (error) {
      setError(appErrorMessage(error, "Failed to create team."));
    } finally {
      setCreating(false);
    }
  }

  async function handleEditTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!myTeam) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/hackathons/teams/${myTeam._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, description: editDesc }),
      });

      await expectAppData(res);

      setEditing(false);
      fetchData(hackathonId);
    } catch (error) {
      setError(appErrorMessage(error, "Failed to update team."));
    } finally {
      setSaving(false);
    }
  }

  function startEditing() {
    if (!myTeam) return;
    setEditName(myTeam.name);
    setEditDesc(myTeam.description || "");
    setEditing(true);
  }

  async function handleRemoveMember(memberId: string) {
    if (!myTeam) return;
    const confirmed = await confirm({
      title: "Remove this member?",
      description:
        "They will be removed from your team and can request to join again.",
      confirmLabel: "Remove member",
    });
    if (!confirmed) return;
    setError("");
    try {
      const res = await fetch(`/api/hackathons/teams/${myTeam._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_member", memberId }),
      });
      await expectAppData(res);
      fetchData(hackathonId);
    } catch (error) {
      setError(appErrorMessage(error, "Failed to remove member."));
    }
  }

  async function handleToggleStatus() {
    if (!myTeam || !hackathon) return;
    setError("");
    try {
      const res = await fetch(`/api/hackathons/teams/${myTeam._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_status" }),
      });
      await expectAppData(res);
      fetchData(hackathonId);
    } catch (error) {
      setError(appErrorMessage(error, "Failed to update team status."));
    }
  }

  async function handleDeleteTeam() {
    if (!myTeam) return;
    const confirmed = await confirm({
      title: "Delete this team?",
      description:
        "Every member will be removed and pending requests are dropped. This cannot be undone.",
      confirmLabel: "Delete team",
    });
    if (!confirmed) return;
    setError("");
    try {
      const res = await fetch(`/api/hackathons/teams/${myTeam._id}`, {
        method: "DELETE",
      });
      await expectAppData(res);
      fetchData(hackathonId);
    } catch (error) {
      setError(appErrorMessage(error, "Failed to delete team."));
    }
  }

  async function handleJoinRequest(teamId: string) {
    setError("");
    try {
      const res = await fetch("/api/hackathons/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, type: "join_request" }),
      });

      await expectAppData(res);

      toast.success("Join request sent!");
    } catch (error) {
      setError(appErrorMessage(error, "Failed to send request."));
    }
  }

  async function handleInvite(teamId: string, toUserId: string) {
    setInviting(toUserId);
    try {
      const res = await fetch("/api/hackathons/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, type: "invite", toUserId }),
      });

      await expectAppData(res);

      toast.success("Invite sent!");
    } catch (error) {
      setError(appErrorMessage(error, "Failed to send invite."));
    } finally {
      setInviting(null);
    }
  }

  async function handleRequestAction(
    requestId: string,
    action: "accept" | "reject",
  ) {
    try {
      const res = await fetch(`/api/hackathons/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      await expectAppData(res);

      // Refresh
      fetchData(hackathonId);
      fetchMyRequests();
      if (myTeam) {
        loadTeamRequests(myTeam._id);
      }
    } catch (error) {
      setError(appErrorMessage(error, `Failed to ${action} request.`));
    }
  }

  // Load pending join requests for a team (team owner)
  async function loadTeamRequests(teamId: string) {
    try {
      const res = await fetch(`/api/hackathons/requests?teamId=${teamId}`);
      const data = await expectAppData(res);
      setPendingRequests(data.items || []);
      setRequestUsers(data.users || {});
    } catch {
      // silent
    }
  }

  if (loading)
    return (
      <div>
        <ListSkeletonContent label="hackathon" />
      </div>
    );
  if (!hackathon) return <p className={styles.error}>Hackathon not found.</p>;

  const deadlinePassed = new Date(hackathon.deadline) < new Date();

  return (
    <div>
      <BackLink href="/internal/hackathons" label="Back to Hackathons" />

      <header className={styles.detailHeader}>
        {hackathon.ogImage && (
          <div className={styles.detailImage}>
            <CompatibleImage
              src={hackathon.ogImage}
              alt={hackathon.name}
              width={1200}
              height={360}
            />
          </div>
        )}
        <h1>{hackathon.name}</h1>
        <span className={styles.org}>{hackathon.organization}</span>
        {hackathon.description && (
          <p className={styles.description}>{hackathon.description}</p>
        )}
        <div className={styles.detailMeta}>
          <span className={styles.metaItem}>
            <IconUsers width={14} height={14} />
            Team of{" "}
            {hackathon.minMembers === hackathon.maxMembers
              ? hackathon.maxMembers
              : `${hackathon.minMembers}-${hackathon.maxMembers}`}
          </span>
          <span className={styles.metaItem}>
            <IconCalendar width={14} height={14} />
            Deadline: {formatDate(hackathon.deadline)}
          </span>
          {hackathon.websiteUrl && (
            <a
              href={hackathon.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkHint}
            >
              <IconExternalLink width={12} height={12} />
              Link to website
            </a>
          )}
        </div>
        {hackathon.skills.length > 0 && (
          <div className={styles.skills}>
            {hackathon.skills.map((s) => (
              <span key={s} className={styles.skill}>
                {s}
              </span>
            ))}
          </div>
        )}
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {/* My invites */}
      {myInvites.length > 0 && (
        <div className={styles.yourTeam}>
          <h3>Pending Invites for You</h3>
          {myInvites
            .filter(
              (inv) =>
                inv.hackathonId === hackathonId ||
                (inv as any).hackathonId?.toString() === hackathonId,
            )
            .map((inv) => {
              const team = teams.find(
                (t) =>
                  t._id === inv.teamId ||
                  t._id === (inv.teamId as any)?.toString(),
              );
              return (
                <div key={inv._id} className={styles.requestItem}>
                  <span>Invite to join {team?.name || "a team"}</span>
                  <div className={styles.requestActions}>
                    <button
                      className={`${styles.btnSmall} ${styles.btnAccept}`}
                      onClick={() => handleRequestAction(inv._id, "accept")}
                    >
                      Accept
                    </button>
                    <button
                      className={`${styles.btnSmall} ${styles.btnReject}`}
                      onClick={() => handleRequestAction(inv._id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Create team */}
      {!deadlinePassed && !isInTeam && (
        <div>
          <button
            className={styles.btnPrimary}
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? "Cancel" : "+ Create a Team"}
          </button>
        </div>
      )}

      {isInTeam && !deadlinePassed && (
        <div className={styles.yourTeam}>
          <div className={styles.teamHeader}>
            <h3>Your Team: {myTeam!.name}</h3>
            <div className={styles.requestActions}>
              {myTeam!.owner === currentUserId && !editing && (
                <>
                  <button
                    className={styles.btnSecondary}
                    onClick={handleToggleStatus}
                    disabled={myTeam!.status === "full"}
                    title={myTeam!.status === "full" ? "Team is full" : ""}
                  >
                    {myTeam!.status === "open" ? "Close Team" : "Open Team"}
                  </button>
                  <button
                    className={styles.btnSecondary}
                    onClick={startEditing}
                  >
                    Edit
                  </button>
                  <button
                    className={`${styles.btnSmall} ${styles.btnReject}`}
                    onClick={handleDeleteTeam}
                  >
                    Delete Team
                  </button>
                </>
              )}
            </div>
          </div>
          {myTeam!.description && !editing && (
            <p className={styles.teamDesc}>{myTeam!.description}</p>
          )}
          <div className={styles.memberSection}>
            <span className={styles.muted}>
              {myTeam!.members.length}/{hackathon.maxMembers} members
            </span>
            <ul className={styles.memberList}>
              {myTeam!.memberDetails.map((m) => (
                <li key={m.id}>
                  <span>
                    {getDisplayName(m.name, m.pizza_count || 0)}
                    {m.id === myTeam!.owner && (
                      <span className={styles.ownerBadge}>Owner</span>
                    )}
                  </span>
                  {myTeam!.owner === currentUserId &&
                    m.id !== currentUserId && (
                      <button
                        className={`${styles.btnSmall} ${styles.btnReject}`}
                        onClick={() => handleRemoveMember(m.id)}
                      >
                        Remove
                      </button>
                    )}
                </li>
              ))}
            </ul>
          </div>
          {editing && (
            <form onSubmit={handleEditTeam} className={styles.editForm}>
              <div className={styles.field}>
                <label>Team Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <label>Description</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  placeholder="Describe what your team is looking for..."
                />
              </div>
              <div className={styles.requestActions}>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {/* Pending join requests for team owner */}
          {myTeam!.owner === currentUserId && pendingRequests.length > 0 && (
            <div className={styles.inviteSection}>
              <label className={styles.muted}>Pending Join Requests</label>
              {pendingRequests.map((req) => {
                const user = requestUsers[req.fromUserId];
                return (
                  <div key={req._id} className={styles.requestItem}>
                    <span>
                      {user
                        ? getDisplayName(user.name, user.pizza_count)
                        : req.fromUserId}
                    </span>
                    <div className={styles.requestActions}>
                      <button
                        className={`${styles.btnSmall} ${styles.btnAccept}`}
                        onClick={() => handleRequestAction(req._id, "accept")}
                      >
                        Accept
                      </button>
                      <button
                        className={`${styles.btnSmall} ${styles.btnReject}`}
                        onClick={() => handleRequestAction(req._id, "reject")}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Invite search for team owner */}
          {myTeam!.owner === currentUserId && myTeam!.status === "open" && (
            <div className={styles.inviteSection}>
              <label className={styles.muted}>
                Invite members to your team
              </label>
              <UserSearch
                search={searchHackathonUsers}
                excludedIds={myTeam!.members}
                placeholder={
                  inviting ? "Sending invitation…" : "Search members to invite…"
                }
                onSelect={(user: UserSearchItem) =>
                  handleInvite(myTeam!._id, user.id)
                }
              />
            </div>
          )}
        </div>
      )}

      {showCreateForm && (
        <form className={styles.createForm} onSubmit={handleCreateTeam}>
          <div className={styles.field}>
            <label>Team Name *</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Your team name"
              required
            />
          </div>
          <div className={styles.field}>
            <label>Description (optional)</label>
            <textarea
              value={teamDesc}
              onChange={(e) => setTeamDesc(e.target.value)}
              placeholder="What skills are you looking for?"
              rows={2}
            />
          </div>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create Team"}
          </button>
        </form>
      )}

      <h2 className={styles.sectionTitle}>Teams ({teams.length})</h2>

      {teams.length === 0 ? (
        <p className={styles.muted}>
          No teams yet. Be the first to create one!
        </p>
      ) : (
        <div className={styles.teams}>
          {teams.map((team) => (
            <div key={team._id} className={styles.teamCard}>
              <div className={styles.teamHeader}>
                <h3>{team.name}</h3>
                <span className={styles.teamStatus}>
                  <span
                    className={`${styles.badge} ${
                      team.status === "open"
                        ? styles.badgeOpen
                        : styles.badgeFull
                    }`}
                  >
                    {team.status}
                  </span>{" "}
                  {team.members.length}/{hackathon.maxMembers}
                </span>
              </div>
              {team.description && (
                <p className={styles.teamDesc}>{team.description}</p>
              )}
              <ul className={styles.memberList}>
                {team.memberDetails.map((m) => (
                  <li key={m.id}>
                    <span>
                      {getDisplayName(m.name, m.pizza_count || 0)}
                      {m.id === team.owner && (
                        <span className={styles.ownerBadge}>Owner</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Join button for open teams - only if user is not in any team */}
              {team.status === "open" && !deadlinePassed && !isInTeam && (
                <div className={styles.teamActions}>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => handleJoinRequest(team._id)}
                  >
                    Request to Join
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
