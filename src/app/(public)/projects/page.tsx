import dbConnect from "@/lib/mongodb";
import Project, { IProject } from "@/models/Project";
import { formatDate, logger } from "@/lib/utils";
import styles from "./Projects.module.scss";

export default async function ProjectsPage() {
  let projects: IProject[] = [];
  let fetchError = false;

  try {
    await dbConnect();
    projects = (await Project.find({})
      .sort({ date: -1 })
      .lean()) as unknown as IProject[];
  } catch (e) {
    logger.error("Failed to fetch projects", e);
    fetchError = true;
  }

  return (
    <div className={styles.container}>
      <h1>Projects & Events</h1>
      <p className={styles.subtitle}>
        Discover what we&apos;ve been building and the events we&apos;ve hosted.
      </p>

      {fetchError && (
        <p className={styles.errorText}>
          Unable to load projects. Please try again later.
        </p>
      )}

      {projects.length === 0 && !fetchError ? (
        <div className={styles.emptyState}>
          <p>No projects or events found. Stay tuned for updates!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {projects.map((project) => (
            <div key={String(project._id)} className={styles.card}>
              <span className={styles.moduleBadge}>{project.module}</span>
              <h2 className={styles.projectTitle}>{project.title}</h2>
              <p className={styles.description}>{project.description}</p>
              <div className={styles.meta}>
                <span>{formatDate(project.date)}</span>
                <span className={styles.status}>{project.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
