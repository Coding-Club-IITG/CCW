"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import CompatibleImage from "@/components/shared/CompatibleImage";
import {
  CLUB_POSITIONS,
  MODULES,
  type AccessLevel,
  type ModuleName,
  type UserRole,
} from "@/lib/constants";
import { getDisplayName } from "@/lib/utils";
import styles from "./Team.module.scss";

export interface PublicTeamMember {
  _id: string;
  name: string;
  image?: string;
  access?: AccessLevel;
  tenure: string;
  managedModules?: ModuleName[];
  roles: UserRole[];
  bio?: string;
  pizza_count?: number;
}

function Card({
  member,
  position,
}: {
  member: PublicTeamMember;
  position?: string;
}) {
  return (
    <div className={styles.card}>
      {member.image ? (
        <CompatibleImage
          src={member.image}
          alt={member.name}
          className={styles.avatarImg}
          width={72}
          height={72}
        />
      ) : (
        <div className={styles.avatar}>{member.name.charAt(0)}</div>
      )}
      {position && <span className={styles.role}>{position}</span>}
      <h2 className={styles.name}>
        {getDisplayName(member.name, member.pizza_count)}
      </h2>
      {member.bio && <p className={styles.bio}>{member.bio}</p>}
    </div>
  );
}

function Roster({ members }: { members: PublicTeamMember[] }) {
  const leadership = CLUB_POSITIONS.flatMap((position) =>
    members
      .filter((member) =>
        member.roles.some((role) => !role.module && role.position === position),
      )
      .map((member) => ({ member, position })),
  );
  const groups = MODULES.map((module) => ({
    module,
    members: members.filter(
      (member) =>
        (member.access === "Head" && member.managedModules?.includes(module)) ||
        member.roles.some(
          (role) => role.module === module && role.position === "Head",
        ),
    ),
  })).filter((group) => group.members.length);
  if (!leadership.length && !groups.length)
    return (
      <p className={styles.empty}>
        No public roster has been added for this tenure.
      </p>
    );
  return (
    <>
      {leadership.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Leadership</h3>
          <div className={styles.grid}>
            {leadership.map(({ member, position }) => (
              <Card
                key={`${member._id}-${position}`}
                member={member}
                position={position}
              />
            ))}
          </div>
        </section>
      )}
      {groups.map((group) => (
        <section key={group.module} className={styles.section}>
          <h3 className={styles.sectionTitle}>{group.module} Heads</h3>
          <div className={styles.grid}>
            {group.members.map((member) => (
              <Card key={`${member._id}-${group.module}`} member={member} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function TeamRosters({
  members,
  currentTenure,
}: {
  members: PublicTeamMember[];
  currentTenure: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const archives = [
    ...new Set(
      members
        .map((member) => member.tenure)
        .filter((tenure) => tenure !== currentTenure),
    ),
  ].sort((a, b) => b.localeCompare(a));
  return (
    <>
      <section aria-labelledby="current-team">
        <h2 id="current-team" className={styles.rosterTitle}>
          Coding Club · {currentTenure}
        </h2>
        <Roster
          members={members.filter((member) => member.tenure === currentTenure)}
        />
      </section>
      {archives.length > 0 && (
        <section className={styles.archives} aria-label="Previous tenures">
          <h2 className={styles.rosterTitle}>Previous Tenures</h2>
          {archives.map((tenure) => {
            const open = expanded.has(tenure);
            const id = `team-${tenure}`;
            return (
              <div key={tenure} className={styles.archive}>
                <button
                  className={styles.archiveButton}
                  aria-expanded={open}
                  aria-controls={id}
                  onClick={() =>
                    setExpanded((old) => {
                      const next = new Set(old);
                      if (next.has(tenure)) next.delete(tenure);
                      else next.add(tenure);
                      return next;
                    })
                  }
                >
                  <ChevronRight
                    className={open ? styles.arrowOpen : styles.arrow}
                    aria-hidden
                  />
                  {tenure}
                </button>
                <div id={id} hidden={!open}>
                  {open && (
                    <Roster
                      members={members.filter(
                        (member) => member.tenure === tenure,
                      )}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
