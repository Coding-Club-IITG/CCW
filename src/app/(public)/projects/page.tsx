import { cachedFetch, CACHE_TTLS } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import Project, { IProject } from "@/models/Project";
import { logger } from "@/lib/utils";
import ProjectCard from "@/components/projects/ProjectCard";
import styles from "./Projects.module.scss";
import type { Metadata } from "next";
import JsonLd from "@/components/shared/JsonLd";
import { pageMetadata, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Projects",
  description:
    "Explore open-source software, machine learning, design, and security projects built by Coding Club IITG members.",
  path: "/projects",
});

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
      {projects.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Coding Club IITG projects",
            url: `${SITE_URL}/projects`,
            itemListElement: projects.map((project, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: project.title,
              url: project.repoLink,
            })),
          }}
        />
      )}
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
            <ProjectCard
              key={String(project._id)}
              title={project.title}
              description={project.description}
              date={project.date}
              module={project.module}
              status={project.status}
              repoLink={project.repoLink}
              liveUrl={project.liveUrl}
              coverImage={project.coverImage}
              coverFocalPoint={project.coverFocalPoint}
              tags={project.tags}
            />
          ))}
        </div>
      )}
    </div>
  );
}
