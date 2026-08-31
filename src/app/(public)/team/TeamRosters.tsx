"use client";

import { useState } from "react";
import { ChevronRight, Maximize2 } from "lucide-react";

import CompatibleImage from "@/components/shared/CompatibleImage";
import Sheet from "@/components/shared/Sheet";
import { IconGithub, IconLinkedIn } from "@/components/shared/Icons";
import EmptyState from "@/components/public/EmptyState";
import {
  CLUB_POSITIONS,
  MODULE_ACCENTS,
  MODULE_DESCRIPTIONS,
  MODULES,
  type AccessLevel,
  type ModuleName,
  type UserRole,
} from "@/lib/constants";
import { githubProfileUrl, normalizeLinkedInUrl } from "@/lib/socialLinks";
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
  githubId?: string;
  linkedinUrl?: string;
  pizza_count?: number;
}

type RosterEntry = {
  member: PublicTeamMember;
  position?: string;
  groupTitle: string;
  accent: string;
};

type Group = {
  id: string;
  title: string;
  accent: string;
  blurb: string;
  entries: RosterEntry[];
};

const LEADERSHIP_BLURB =
  "Overall coordination, projects and everything that falls between modules.";

function buildGroups(members: PublicTeamMember[]): Group[] {
  const leadership: RosterEntry[] = CLUB_POSITIONS.flatMap((position) =>
    members
      .filter((member) =>
        member.roles.some((role) => !role.module && role.position === position),
      )
      .map((member) => ({
        member,
        position,
        groupTitle: "Leadership",
        accent: "var(--foreground-strong)",
      })),
  );

  const moduleGroups: Group[] = MODULES.map((moduleName) => {
    const accent = MODULE_ACCENTS[moduleName];
    const entries = members
      .filter(
        (member) =>
          (member.access === "Head" &&
            member.managedModules?.includes(moduleName)) ||
          member.roles.some(
            (role) => role.module === moduleName && role.position === "Head",
          ),
      )
      .map((member) => ({
        member,
        position: "Module Head",
        groupTitle: moduleName,
        accent,
      }));

    return {
      id: moduleName.toLowerCase().replace(/\s+/g, "-"),
      title: moduleName,
      accent,
      blurb: MODULE_DESCRIPTIONS[moduleName],
      entries,
    };
  }).filter((group) => group.entries.length > 0);

  return [
    ...(leadership.length > 0
      ? [
          {
            id: "leadership",
            title: "Leadership",
            accent: "var(--foreground-strong)",
            blurb: LEADERSHIP_BLURB,
            entries: leadership,
          },
        ]
      : []),
    ...moduleGroups,
  ];
}

/** Roster grids + member sheet */
function Roster({ members }: { members: PublicTeamMember[] }) {
  const groups = buildGroups(members);
  const flat = groups.flatMap((group) => group.entries);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No roster yet"
        hint="No public roster has been added for this tenure."
      />
    );
  }

  const active = openIndex === null ? null : flat[openIndex];
  const github = githubProfileUrl(active?.member.githubId);
  const linkedin = normalizeLinkedInUrl(active?.member.linkedinUrl);

  return (
    <>
      {groups.map((group) => (
        <section
          key={group.id}
          id={group.id}
          className={styles.group}
          style={{ "--accent": group.accent } as React.CSSProperties}
        >
          <header className={styles.groupHeader}>
            <div className={styles.groupHeading}>
              <h3 className={styles.groupTitle}>{group.title}</h3>
              <span className={styles.groupCount}>
                {group.entries.length}{" "}
                {group.entries.length === 1 ? "member" : "members"}
              </span>
            </div>
            <p className={styles.groupBlurb}>{group.blurb}</p>
          </header>

          <div className={styles.grid}>
            {group.entries.map((entry) => {
              const index = flat.indexOf(entry);
              const displayName = getDisplayName(
                entry.member.name,
                entry.member.pizza_count,
              );
              return (
                <button
                  key={`${entry.member._id}-${entry.groupTitle}-${entry.position}`}
                  type="button"
                  className={styles.person}
                  onClick={() => setOpenIndex(index)}
                  aria-haspopup="dialog"
                  aria-label={`More about ${displayName}`}
                >
                  <span className={styles.photoFrame}>
                    <span className={styles.photo}>
                      <span className={styles.photoInitial} aria-hidden="true">
                        {entry.member.name.charAt(0)}
                      </span>
                      {entry.member.image && (
                        <CompatibleImage
                          src={entry.member.image}
                          alt=""
                          width={420}
                          height={420}
                          className={styles.photoImage}
                        />
                      )}
                    </span>
                  </span>

                  <span className={styles.personName}>{displayName}</span>
                  {entry.position && (
                    <span className={styles.personRole}>{entry.position}</span>
                  )}

                  <span className={styles.personFoot}>
                    <span className={styles.personHint}>
                      {entry.member.bio ? "Read bio" : "View profile"}
                    </span>
                    <span className={styles.personExpand} aria-hidden="true">
                      <Maximize2 size={13} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {active && (
        <Sheet
          label={getDisplayName(active.member.name, active.member.pizza_count)}
          accent={active.accent}
          onClose={() => setOpenIndex(null)}
          footer={
            flat.length > 1 ? (
              <button
                type="button"
                className={styles.sheetNext}
                onClick={() =>
                  setOpenIndex(((openIndex ?? 0) + 1) % flat.length)
                }
              >
                Next member →
              </button>
            ) : undefined
          }
        >
          <div
            className={styles.sheet}
            style={{ "--accent": active.accent } as React.CSSProperties}
          >
            <div className={styles.sheetPortrait}>
              <span className={styles.sheetInitial} aria-hidden="true">
                {active.member.name.charAt(0)}
              </span>
              {active.member.image && (
                <CompatibleImage
                  src={active.member.image}
                  alt=""
                  width={720}
                  height={720}
                  className={styles.sheetPhoto}
                />
              )}
            </div>

            <div className={styles.sheetBody}>
              <h2 className={styles.sheetName}>
                {getDisplayName(active.member.name, active.member.pizza_count)}
              </h2>

              {active.member.bio ? (
                <blockquote className={styles.sheetBio}>
                  {active.member.bio}
                </blockquote>
              ) : (
                <p className={styles.sheetNoBio}>
                  This member hasn&rsquo;t written a bio yet.
                </p>
              )}

              <dl className={styles.sheetFacts}>
                <div className={styles.sheetFact}>
                  <dt>module</dt>
                  <dd>{active.groupTitle}</dd>
                </div>
                <div className={styles.sheetFact}>
                  <dt>position</dt>
                  <dd>{active.position ?? "Member"}</dd>
                </div>
                <div className={styles.sheetFact}>
                  <dt>tenure</dt>
                  <dd>{active.member.tenure}</dd>
                </div>
              </dl>

              {(github || linkedin) && (
                <div className={styles.sheetSocials}>
                  {github && (
                    <a
                      href={github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.sheetSocial}
                    >
                      <IconGithub width={15} height={15} aria-hidden="true" />
                      GitHub
                    </a>
                  )}
                  {linkedin && (
                    <a
                      href={linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.sheetSocial}
                    >
                      <IconLinkedIn width={15} height={15} aria-hidden="true" />
                      LinkedIn
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </Sheet>
      )}
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
      <div className={styles.rosters}>
        <Roster
          members={members.filter((member) => member.tenure === currentTenure)}
        />
      </div>

      {archives.length > 0 && (
        <section className={styles.archives} aria-label="Previous tenures">
          <h2 className={styles.archivesTitle}>Previous tenures</h2>
          {archives.map((tenure) => {
            const open = expanded.has(tenure);
            const id = `team-${tenure}`;
            const count = members.filter(
              (member) => member.tenure === tenure,
            ).length;
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
                    aria-hidden="true"
                  />
                  <span className={styles.archiveTenure}>{tenure}</span>
                  <span className={styles.archiveCount}>
                    {count} {count === 1 ? "member" : "members"}
                  </span>
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
