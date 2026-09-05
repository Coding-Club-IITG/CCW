import type { CSSProperties } from "react";

import { MODULE_ACCENTS, MODULE_BARS } from "@/lib/constants";
import {
  recruitmentStatus,
  type RecruitmentModuleDto,
} from "@/lib/recruitment";
import { formatDateTime } from "@/lib/utils";

import DocumentCard from "./DocumentCard";
import styles from "./Recruitment.module.scss";

export default function ModuleDocuments({
  modules,
  now,
}: {
  modules: RecruitmentModuleDto[];
  now: Date;
}) {
  return (
    <section className={styles.section} aria-labelledby="recruitment-documents">
      <div className={styles.sectionHead}>
        <h2 id="recruitment-documents">Documents</h2>
        <span className={styles.meta}>
          Resources first. Your next challenge follows.
        </span>
      </div>
      {modules.map((module, index) => (
        <section
          key={module.module}
          className={styles.moduleGroup}
          aria-labelledby={`module-${index}`}
          style={
            {
              "--accent": MODULE_ACCENTS[module.module],
              "--bar": MODULE_BARS[module.module],
            } as CSSProperties
          }
        >
          <div className={styles.moduleHeading}>
            <div className={styles.moduleBar} />
            <span className={styles.moduleNumber}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 id={`module-${index}`}>{module.module}</h3>
            <span className={styles.status}>
              {recruitmentStatus(module, now)}
            </span>
            {module.submissionDeadline && (
              <p className={styles.deadlineNote}>
                Submissions close
                <br />
                <time dateTime={module.submissionDeadline}>
                  {formatDateTime(module.submissionDeadline)} IST
                </time>
              </p>
            )}
          </div>
          <DocumentCard
            slot={module.resources}
            title="Resources"
            module={module.module}
          />
          <DocumentCard
            slot={module.task}
            title="Task"
            module={module.module}
          />
        </section>
      ))}
    </section>
  );
}
