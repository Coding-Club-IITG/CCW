import type { CSSProperties } from "react";

import { MODULE_ACCENTS, MODULE_BARS } from "@/lib/constants";
import {
  buildRecruitmentSchedule,
  recruitmentDateLabel,
  type RecruitmentModuleDto,
} from "@/lib/recruitment";
import { formatDateTime } from "@/lib/utils";

import styles from "./Recruitment.module.scss";

export default function RecruitmentSchedule({
  modules,
}: {
  modules: RecruitmentModuleDto[];
}) {
  const schedule = buildRecruitmentSchedule(modules);
  if (!schedule) return null;
  return (
    <section className={styles.section} aria-labelledby="recruitment-schedule">
      <div className={styles.sectionHead}>
        <h2 id="recruitment-schedule">Schedule</h2>
        <div className={styles.legend}>
          <span>
            <i className={styles.resourceDot} />
            Resources release
          </span>
          <span>
            <i className={styles.taskDot} />
            Task release
          </span>
          <span>
            <i className={styles.deadlineDot} />
            Submissions close
          </span>
        </div>
      </div>
      <div
        className={styles.scheduleScroll}
        tabIndex={0}
        role="region"
        aria-label="Recruitment schedule"
      >
        <div className={styles.schedule}>
          <div className={styles.axis}>
            <span className={styles.meta}>Release schedule</span>
            <div className={styles.axisTicks}>
              {schedule.ticks.map((tick) => (
                <span key={tick.at} style={{ left: `${tick.position}%` }}>
                  {recruitmentDateLabel(tick.at)}
                </span>
              ))}
            </div>
          </div>
          {schedule.lanes.map((lane) => (
            <div
              key={lane.module}
              className={styles.lane}
              style={
                {
                  "--accent": MODULE_ACCENTS[lane.module],
                  "--bar": MODULE_BARS[lane.module],
                } as CSSProperties
              }
            >
              <div className={styles.laneName}>
                <i />
                {lane.module}
              </div>
              <div className={styles.track} style={{ height: lane.rows * 62 }}>
                <div className={styles.rule} />
                {lane.bar ? (
                  <div
                    className={styles.bar}
                    style={{
                      left: `${lane.bar.left}%`,
                      width: `${lane.bar.width}%`,
                    }}
                  />
                ) : (
                  <span className={styles.announced}>To be announced</span>
                )}
                {lane.marks.map((mark) => (
                  <div
                    key={mark.kind}
                    className={`${styles.mark} ${mark.flip ? styles.flipped : ""} ${mark.kind === "deadline" ? styles.deadline : ""}`}
                    style={{
                      left: `${mark.position}%`,
                      top: mark.row * 62 + 6,
                    }}
                  >
                    <span className={styles.markLabel}>
                      <i
                        className={
                          mark.kind === "resources"
                            ? styles.resourceDot
                            : mark.kind === "task"
                              ? styles.taskDot
                              : styles.deadlineDot
                        }
                      />
                      {mark.kind === "deadline" ? "Closes" : mark.kind}
                    </span>
                    <time
                      dateTime={mark.at}
                      title={formatDateTime(mark.at)}
                      aria-label={`${mark.kind === "deadline" ? "Submissions close" : `${mark.kind} release`}: ${formatDateTime(mark.at)} IST`}
                    >
                      {recruitmentDateLabel(mark.at)}
                    </time>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
