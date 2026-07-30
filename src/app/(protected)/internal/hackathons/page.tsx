"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import SearchInput from "@/components/shared/SearchInput";
import CompatibleImage from "@/components/shared/CompatibleImage";
import { formatDate } from "@/lib/utils";
import {
  IconUsers,
  IconCalendar,
  IconExternalLink,
} from "@/components/shared/Icons";
import styles from "./Hackathons.module.scss";

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

export default function HackathonsPage() {
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/hackathons")
      .then((res) => res.json())
      .then((data) => setHackathons(data.items || []))
      .finally(() => setLoading(false));
  }, []);

  const filteredHackathons = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return hackathons;

    return hackathons.filter((hackathon) => {
      const matchesName = hackathon.name.toLowerCase().includes(query);
      const matchesOrganization = hackathon.organization
        .toLowerCase()
        .includes(query);
      const matchesSkills = hackathon.skills.some((skill) =>
        skill.toLowerCase().includes(query),
      );

      return matchesName || matchesOrganization || matchesSkills;
    });
  }, [hackathons, search]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Hackathon Finder</h1>
        <p>Find active hackathons and build your dream team.</p>
      </header>

      <div className={styles.searchWrapper}>
        <SearchInput
          placeholder="Search by name, organization, or skill"
          value={search}
          onChange={setSearch}
        />
      </div>

      {loading ? (
        <p className={styles.muted}>Loading hackathons...</p>
      ) : hackathons.length === 0 ? (
        <p className={styles.muted}>No active hackathons right now.</p>
      ) : filteredHackathons.length === 0 ? (
        <p className={styles.muted}>No hackathons match your search.</p>
      ) : (
        <div className={styles.grid}>
          {filteredHackathons.map((h) => (
            <Link
              key={h._id}
              href={`/internal/hackathons/${h._id}`}
              className={styles.card}
            >
              {h.ogImage && (
                <div className={styles.cardImage}>
                  <CompatibleImage
                    src={h.ogImage}
                    alt={h.name}
                    width={640}
                    height={280}
                  />
                </div>
              )}
              <div className={styles.cardTop}>
                <h3>{h.name}</h3>
                <span className={styles.org}>{h.organization}</span>
              </div>
              {h.description && (
                <p className={styles.description}>{h.description}</p>
              )}
              <div className={styles.meta}>
                <span className={styles.metaItem}>
                  <IconUsers width={14} height={14} />
                  Team of{" "}
                  {h.minMembers === h.maxMembers
                    ? h.maxMembers
                    : `${h.minMembers}-${h.maxMembers}`}
                </span>
                <span className={styles.metaItem}>
                  <IconCalendar width={14} height={14} />
                  {formatDate(h.deadline)}
                </span>
              </div>
              {h.skills.length > 0 && (
                <div className={styles.skills}>
                  {h.skills.map((s) => (
                    <span key={s} className={styles.skill}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {h.websiteUrl && (
                <span className={styles.linkHint}>
                  <IconExternalLink width={12} height={12} />
                  Link to website
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
