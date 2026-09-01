"use client";

import { useState } from "react";
import { ArrowUpRight, Maximize2 } from "lucide-react";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import FocalImage from "@/components/shared/FocalImage";
import Sheet from "@/components/shared/Sheet";
import { IconGithub } from "@/components/shared/Icons";
import styles from "./Projects.module.scss";

export type ProjectRowData = {
  id: string;
  index: string;
  title: string;
  description: string;
  moduleLabel: string;
  accent: string;
  status: string;
  since: string;
  repoLink: string;
  liveUrl?: string;
  liveLabel?: string;
  coverImage?: string;
  coverFocalPoint?: ImageFocalPoint;
  stack: string[];
  takeaways: string[];
  contributorCount: number;
};

/**
 * Project row + expand sheet
 */
export default function ProjectRow({ project }: { project: ProjectRowData }) {
  const [open, setOpen] = useState(false);
  const accentStyle = { "--accent": project.accent } as React.CSSProperties;

  return (
    <>
      <div className={styles.row} style={accentStyle}>
        <div className={styles.rowBody}>
          <p className={styles.rowKicker}>
            <span className={styles.rowIndex}>{project.index}</span>
            <span className={styles.module}>{project.moduleLabel}</span>
            <span className={styles.rowStatus}>{project.status}</span>
          </p>

          <h2 className={styles.rowTitle}>{project.title}</h2>
          <p className={styles.rowDescription}>{project.description}</p>

          {project.stack.length > 0 && (
            <div className={styles.stack}>
              {project.stack.map((item) => (
                <span key={item} className={styles.stackItem}>
                  {item}
                </span>
              ))}
            </div>
          )}

          <div className={styles.rowActions}>
            {project.liveUrl && (
              <a
                className={styles.liveLink}
                href={project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {project.liveLabel}
                <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            )}
            <a
              className={styles.sourceLink}
              href={project.repoLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconGithub width={13} height={13} aria-hidden="true" />
              Source
            </a>
            <span className={styles.rowMeta}>since {project.since}</span>
            {project.contributorCount > 0 && (
              <span className={styles.rowMetaDim}>
                {project.contributorCount} on it
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className={styles.cover}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Learn more about ${project.title}`}
        >
          <span className={styles.coverMedia}>
            {project.coverImage && (
              <FocalImage
                src={project.coverImage}
                focalPoint={project.coverFocalPoint}
                alt=""
                width={900}
                height={560}
                sizes="(max-width: 900px) 100vw, 50vw"
                loading="lazy"
                className={styles.coverImage}
              />
            )}
          </span>
          <span className={styles.coverScrim} aria-hidden="true" />
          <span className={styles.coverCta}>
            Learn more
            <Maximize2 size={12} aria-hidden="true" />
          </span>
        </button>
      </div>

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
              <div>
                {project.takeaways.length > 0 && (
                  <>
                    <p className={styles.sheetLabel}>What it teaches</p>
                    <ul className={styles.takeaways}>
                      {project.takeaways.map((takeaway) => (
                        <li key={takeaway}>
                          <span aria-hidden="true">-</span>
                          {takeaway}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {project.stack.length > 0 && (
                  <>
                    <p className={styles.sheetLabel}>Stack</p>
                    <div className={styles.stack}>
                      {project.stack.map((item) => (
                        <span key={item} className={styles.stackItem}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </>
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
