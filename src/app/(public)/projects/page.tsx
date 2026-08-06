import { cachedFetch, CACHE_TTLS } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import Project, { IProject } from "@/models/Project";
import { logger } from "@/lib/utils";
import FocalImage from "@/components/shared/FocalImage";
import styles from "./Projects.module.scss";

function formatMonthYear(date: Date): string {
  return new Date(date).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export default async function ProjectsPage() {
  let projects: IProject[] = [];
  let fetchError = false;

  try {
    await dbConnect();
    projects = await cachedFetch<IProject[]>(
      "ccw:projects:public",
      CACHE_TTLS.PROJECTS,
      async () => {
        const result = await Project.find({}).sort({ date: -1 }).lean();
        return result as unknown as IProject[];
      },
    );
  } catch (e) {
    logger.error("Failed to fetch projects", e);
    fetchError = true;
  }

  return (
    <div className={styles.container}>
      <h1>Projects</h1>
      <p className={styles.subtitle}>
        Open-source projects built by Coding Club IITG members.
      </p>

      {fetchError && (
        <p className={styles.errorText}>
          Unable to load projects. Please try again later.
        </p>
      )}

      {projects.length === 0 && !fetchError ? (
        <div className={styles.emptyState}>
          <p>No projects found. Stay tuned for updates!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {projects.map((project) => (
            <a
              key={String(project._id)}
              href={project.repoLink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.card}
            >
              {project.coverImage && (
                <div className={styles.coverWrapper}>
                  <FocalImage
                    src={project.coverImage}
                    focalPoint={project.coverFocalPoint}
                    alt={project.title}
                    className={styles.cover}
                    width={640}
                    height={360}
                  />
                </div>
              )}
              <div className={styles.cardContent}>
                <span className={styles.moduleBadge}>{project.module}</span>
                <h2 className={styles.projectTitle}>{project.title}</h2>
                <p className={styles.description}>{project.description}</p>
                <div className={styles.meta}>
                  <span>{formatMonthYear(project.date)}</span>
                  <span className={styles.status}>{project.status}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
