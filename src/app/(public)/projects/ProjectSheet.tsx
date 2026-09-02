"use client";

import { useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import Sheet from "@/components/shared/Sheet";
import { IconGithub } from "@/components/shared/Icons";
import styles from "./Projects.module.scss";

export type ProjectSheetData = {
  title: string;
  description: string;
  moduleLabel: string;
  accent: string;
  status: string;
  since: string;
  repoLink: string;
  liveUrl?: string;
  liveLabel?: string;
  stack: string[];
  takeaways: string[];
  contributorCount: number;
};

type Props = {
  project: ProjectSheetData;
  triggerClassName: string;
  children: ReactNode;
};

export default function ProjectSheet({
  project,
  triggerClassName,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const accentStyle = { "--accent": project.accent } as React.CSSProperties;

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Learn more about ${project.title}`}
      >
        {children}
      </button>

      {open && (
        <Sheet
          label={project.title}
          accent={project.accent}
          onClose={() => setOpen(false)}
        >
          <div className={styles.sheet} style={accentStyle}>
            <p className={styles.sheetKicker}>
              <span className={styles.module}>{project.moduleLabel}</span>
              <span className={styles.sheetStatus}>{project.status}</span>
              <span className={styles.sheetSince}>since {project.since}</span>
            </p>
            <h2 className={styles.sheetTitle}>{project.title}</h2>
            <p className={styles.sheetDescription}>{project.description}</p>

            <div className={styles.sheetGrid}>
              <div className={styles.sheetSections}>
                {project.takeaways.length > 0 && (
                  <section>
                    <p className={styles.sheetLabel}>What it teaches</p>
                    <ul className={styles.takeaways}>
                      {project.takeaways.map((takeaway) => (
                        <li key={takeaway}>
                          <span aria-hidden="true">-</span>
                          {takeaway}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {project.stack.length > 0 && (
                  <section>
                    <p className={styles.sheetLabel}>Stack</p>
                    <div className={styles.stack}>
                      {project.stack.map((item) => (
                        <span key={item} className={styles.stackItem}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div>
                <dl className={styles.stats}>
                  <div className={styles.stat}>
                    <dt>on it now</dt>
                    <dd>{project.contributorCount || "-"}</dd>
                  </div>
                  <div className={styles.stat}>
                    <dt>running since</dt>
                    <dd className={styles.statAccent}>{project.since}</dd>
                  </div>
                </dl>

                <div className={styles.sheetActions}>
                  {project.liveUrl && (
                    <a
                      className={styles.sheetPrimary}
                      href={project.liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {project.liveLabel}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  )}
                  <a
                    className={styles.sheetSecondary}
                    href={project.repoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Source
                    <IconGithub width={15} height={15} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
