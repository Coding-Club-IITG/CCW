import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import { MODULE_ACCENTS, PROJECT_MODULES } from "@/lib/constants";
import type { ProjectModuleName, ProjectStatus } from "@/lib/constants";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import dbConnect from "@/lib/mongodb";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { errorToLogMetadata, formatMonthYear, logger } from "@/lib/utils";
import Project from "@/models/Project";
import EmptyState from "@/components/public/EmptyState";
import FilterChips from "@/components/public/FilterChips";
import PageHeader from "@/components/public/PageHeader";
import JsonLd from "@/components/shared/JsonLd";
import ProjectRow, { type ProjectRowData } from "./ProjectRow";
import styles from "./Projects.module.scss";

export const metadata: Metadata = pageMetadata({
  title: "Projects",
  description:
    "Explore open-source projects built by Coding Club IITG members.",
  path: "/projects",
});

type SearchParams = { module?: string };
type Props = { searchParams: Promise<SearchParams> };

type ListedProject = {
  _id: string;
  title: string;
  description: string;
  date: string;
  module: ProjectModuleName;
  status: ProjectStatus;
  repoLink: string;
  liveUrl?: string;
  coverImage?: string;
  coverFocalPoint?: ImageFocalPoint;
  tags: string[];
  takeaways: string[];
  contributorCount: number;
};

function projectsHref(moduleName: string) {
  return moduleName
    ? `/projects?module=${encodeURIComponent(moduleName)}`
    : "/projects";
}

/** Strip the scheme so a live URL reads as a domain in the action row */
function liveLabel(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function getProjects(): Promise<ListedProject[]> {
  await dbConnect();

  return cachedFetch(
    buildCacheKey("projects:public:v2"),
    CACHE_TTLS.PROJECTS,
    async () => {
      const projects = await Project.find({})
        .select(
          "title description date module status repoLink liveUrl coverImage coverFocalPoint tags takeaways contributors",
        )
        .sort({ date: -1 })
        .lean();

      const listed = projects.map((project) => {
        const { contributors, ...rest } = project as typeof project & {
          contributors?: unknown[];
        };
        return { ...rest, contributorCount: contributors?.length ?? 0 };
      });

      return JSON.parse(JSON.stringify(listed)) as ListedProject[];
    },
  );
}

export default async function ProjectsPage({ searchParams }: Props) {
  const query = await searchParams;
  const activeModule = query.module?.trim() ?? "";

  let projects: ListedProject[] = [];
  let failed = false;
  try {
    projects = await getProjects();
  } catch (error) {
    logger.error("Failed to fetch projects", {
      route: "/projects",
      operation: "list_projects",
      ...errorToLogMetadata(error),
    });
    failed = true;
  }

  const modules = PROJECT_MODULES.filter((moduleName) =>
    projects.some((project) => project.module === moduleName),
  );
  const filtered = activeModule
    ? projects.filter((project) => project.module === activeModule)
    : projects;

  const chips = [
    { label: "All", href: projectsHref(""), active: !activeModule },
    ...modules.map((moduleName) => ({
      label: moduleName,
      href: projectsHref(activeModule === moduleName ? "" : moduleName),
      active: activeModule === moduleName,
    })),
  ];

  const rows: ProjectRowData[] = filtered.map((project, index) => ({
    id: project._id,
    index: String(index + 1).padStart(2, "0"),
    title: project.title,
    description: project.description,
    moduleLabel: project.module,
    accent: MODULE_ACCENTS[project.module] ?? "var(--muted)",
    status: project.status,
    since: formatMonthYear(project.date),
    repoLink: project.repoLink,
    liveUrl: project.liveUrl,
    liveLabel: liveLabel(project.liveUrl),
    coverImage: project.coverImage,
    coverFocalPoint: project.coverFocalPoint,
    stack: project.tags,
    takeaways: project.takeaways ?? [],
    contributorCount: project.contributorCount,
  }));

  const ongoing = filtered.filter(
    (project) => project.status === "Ongoing",
  ).length;
  const countLabel = `${ongoing} ${ongoing === 1 ? "project" : "projects"} in progress`;

  return (
    <div className={styles.page}>
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

      <PageHeader
        kicker={countLabel}
        title="Projects"
        glow="violet"
        lead="Stuff we've worked on over the years, including projects we currently maintain."
      />

      <div className={styles.filterBar}>
        <FilterChips options={chips} label="Filter projects by module" />
      </div>

      {failed && (
        <p className={styles.error}>
          Unable to load projects. Please try again later.
        </p>
      )}

      {rows.length > 0 ? (
        <div className={styles.rows}>
          {rows.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </div>
      ) : (
        !failed && (
          <EmptyState
            title="Nothing here yet"
            hint="Try another module, or check back after the next build season."
          />
        )
      )}

      <section className={styles.join}>
        <div className={styles.joinInner}>
          <div>
            <p className={styles.joinKicker}>Want in</p>
            <h2 className={styles.joinTitle}>
              Pick something
              <br />
              you can&rsquo;t do yet
            </h2>
            <p className={styles.joinLead}>
              Projects grow when someone turns up wanting to work on one. Come
              to a module session, say which of these interests you, and you
              will leave with a piece of it.
            </p>
          </div>
          <Link href="/events" className={styles.joinAction}>
            Find the next session
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
