"use client";

import { useEffect, useState } from "react";

import { expectAppData } from "@/lib/api/result";
import { getDisplayName } from "@/lib/utils";

import BackLink from "@/components/shared/BackLink";

import styles from "../Hackathons.module.scss";
import { FormSkeletonContent } from "@/components/shared/skeletons/FormSkeleton";

interface Team {
  _id: string;
  name: string;
  owner: string;
  members: string[];
  memberDetails: { id: string; name: string; pizza_count?: number }[];
  status: string;
  description: string;
}

interface Hackathon {
  _id: string;
  name: string;
  organization: string;
  minMembers: number;
  maxMembers: number;
  deadline: string;
  status: string;
}

export default function AdminHackathonMonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [hackathonId, setHackathonId] = useState<string>("");

  useEffect(() => {
    params.then(({ id }) => {
      setHackathonId(id);
      fetchData(id);
    });
  }, [params]);

  async function fetchData(id: string) {
    try {
      const res = await fetch(`/api/hackathons/${id}/teams`);
      const data = await expectAppData(res);
      setHackathon(data.hackathon);
      setTeams(data.teams || []);
    } catch {
      // error handled by empty state
    } finally {
      setLoading(false);
    }
  }

  if (loading)
    return (
      <div>
        <FormSkeletonContent label="hackathon" fields={5} />
      </div>
    );
  if (!hackathon) return <p className={styles.error}>Hackathon not found.</p>;

  return (
    <div>
      <BackLink href="/admin/hackathons" label="Back to Hackathons" />

      <header className={styles.header}>
        <h1>{hackathon.name}</h1>
        <p>
          {hackathon.organization} • Team size:{" "}
          {hackathon.minMembers === hackathon.maxMembers
            ? hackathon.maxMembers
            : `${hackathon.minMembers}-${hackathon.maxMembers}`}{" "}
          • Deadline: {new Date(hackathon.deadline).toLocaleDateString()}
        </p>
      </header>

      <h2 className={styles.sectionTitle}>Registered Teams ({teams.length})</h2>

      {teams.length === 0 ? (
        <p className={styles.muted}>No teams registered yet.</p>
      ) : (
        <div className={styles.teams}>
          {teams.map((team) => (
            <div key={team._id} className={styles.teamCard}>
              <div className={styles.teamHeader}>
                <h3>{team.name}</h3>
                <span
                  className={`${styles.badge} ${
                    team.status === "full"
                      ? styles.badgeActive
                      : team.status === "closed"
                        ? styles.badgeArchived
                        : ""
                  }`}
                >
                  {team.status} ({team.members.length}/{hackathon.maxMembers})
                </span>
              </div>
              {team.description && (
                <p className={styles.muted}>{team.description}</p>
              )}
              <ul className={styles.memberList}>
                {team.memberDetails.map((m) => (
                  <li key={m.id}>
                    {getDisplayName(m.name, m.pizza_count || 0)}
                    {m.id === team.owner && (
                      <span className={styles.ownerBadge}>Owner</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
