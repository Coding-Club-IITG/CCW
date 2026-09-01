import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import {
  CLUB_POSITIONS,
  CURRENT_TENURE,
  MODULE_ACCENTS,
  MODULE_BARS,
  MODULE_DESCRIPTIONS,
  MODULES,
  tagAccent,
  type ClubPosition,
  type ModuleName,
  type ProjectModuleName,
} from "@/lib/constants";
import { formatEventDate } from "@/lib/eventDate";
import { getEventStatus } from "@/lib/eventStatus";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import dbConnect from "@/lib/mongodb";
import {
  CLUB_EMAIL,
  IITG_ADDRESS,
  pageMetadata,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
} from "@/lib/seo";
import {
  errorToLogMetadata,
  formatMonthYear,
  formatShortDate,
  getDisplayName,
  logger,
} from "@/lib/utils";
import BlogPost from "@/models/BlogPost";
import Event from "@/models/Event";
import Project from "@/models/Project";
import User from "@/models/User";
import JsonLd from "@/components/shared/JsonLd";
import CompatibleImage from "@/components/shared/CompatibleImage";
import FocalImage from "@/components/shared/FocalImage";
import CountUp from "@/components/public/CountUp";
import Reveal from "@/components/public/Reveal";
import ScrollProgress from "@/components/public/ScrollProgress";
import PrismHero from "./PrismHero";
import styles from "./Home.module.scss";

export const metadata: Metadata = {
  ...pageMetadata({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    path: "/",
  }),
  title: { absolute: SITE_NAME },
};

interface Props {
  searchParams: Promise<{ error?: string }>;
}

const MARQUEE = [
  "design",
  "competitive programming",
  "machine learning",
  "app development",
  "web development",
  "open source",
  "cyber security",
];

type HomeData = {
  heads: number;
  ongoingProjects: number;
  publishedPosts: number;
  projects: Array<{
    id: string;
    title: string;
    module: string;
    description: string;
    since: string;
    takeaways: string[];
  }>;
  events: Array<{
    id: string;
    slug: string;
    title: string;
    module: string;
    status: string;
    when: string;
    shortDescription: string;
    poster?: string;
    posterFocalPoint?: ImageFocalPoint;
  }>;
  posts: Array<{
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    tags: string[];
    authors: string;
    date: string;
  }>;
  faces: Array<{
    id: string;
    name: string;
    initial: string;
    role: string;
    accent: string;
    image?: string;
  }>;
};

const EMPTY: HomeData = {
  heads: 0,
  ongoingProjects: 0,
  publishedPosts: 0,
  projects: [],
  events: [],
  posts: [],
  faces: [],
};

async function getHomeData(): Promise<HomeData> {
  await dbConnect();

  return cachedFetch(buildCacheKey("home:v2"), CACHE_TTLS.EVENTS, async () => {
    const [
      heads,
      ongoingProjects,
      publishedPosts,
      projects,
      events,
      posts,
      team,
    ] = await Promise.all([
      User.countDocuments({
        tenure: CURRENT_TENURE,
        $or: [
          { roles: { $elemMatch: { position: "Head" } } },
          { access: "Head", "managedModules.0": { $exists: true } },
        ],
        email: { $ne: CLUB_EMAIL },
      }),
      Project.countDocuments({ status: "Ongoing" }),
      BlogPost.countDocuments({ status: "published" }),
      Project.find({})
        .select("title module description date takeaways")
        .sort({ date: -1 })
        .limit(4)
        .lean(),
      Event.find({ status: "published" })
        .select(
          "title slug module shortDescription poster posterFocalPoint startDate endDate allDay recurrenceType recurrenceCount",
        )
        .sort({ startDate: -1 })
        .limit(3)
        .lean(),
      BlogPost.find({ status: "published" })
        .select("title slug excerpt tags authors publishedAt")
        .sort({ publishedAt: -1 })
        .limit(3)
        .lean(),

      User.find({
        tenure: CURRENT_TENURE,
        $or: [
          {
            roles: {
              $elemMatch: {
                position: { $in: [...CLUB_POSITIONS, "Head"] },
              },
            },
          },
          { access: "Head", "managedModules.0": { $exists: true } },
        ],
        email: { $ne: CLUB_EMAIL },
      })
        .select("name image access managedModules roles pizza_count")
        .lean(),
    ]);

    return JSON.parse(
      JSON.stringify({
        heads,
        ongoingProjects,
        publishedPosts,
        projects: projects.map((project) => ({
          id: String(project._id),
          title: project.title,
          module: project.module,
          description: project.description,
          since: formatMonthYear(project.date),
          takeaways: (project.takeaways ?? []).slice(0, 3),
        })),
        events: events.map((event) => ({
          id: String(event._id),
          slug: event.slug,
          title: event.title,
          module: event.module ?? "Coding Club",
          status: getEventStatus(
            event.startDate,
            event.endDate,
            event.recurrenceType,
            event.recurrenceCount,
          ),
          when: formatEventDate(event.startDate, undefined, event.allDay),
          shortDescription: event.shortDescription,
          poster: event.poster,
          posterFocalPoint: event.posterFocalPoint,
        })),
        posts: posts.map((post) => ({
          id: String(post._id),
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt,
          tags: post.tags,
          authors:
            post.authors
              .map((author: { name: string }) => author.name)
              .join(", ") || "Coding Club",
          date: formatShortDate(post.publishedAt),
        })),
        faces: [...team]
          .map((member) => {
            type Role = { module?: string | null; position: string };
            const roles = (member.roles ?? []) as Role[];
            const club = roles.find(
              (role) =>
                !role.module && CLUB_POSITIONS.includes(role.position as never),
            );
            const moduleName =
              member.managedModules?.[0] ??
              roles.find((role) => role.module)?.module ??
              undefined;
            return {
              id: String(member._id),
              name: getDisplayName(member.name ?? "", member.pizza_count),
              initial: (member.name ?? "?").charAt(0),
              role: club?.position ?? moduleName ?? "Member",
              accent: club
                ? "var(--foreground-strong)"
                : (MODULE_ACCENTS[moduleName as ProjectModuleName] ??
                  "var(--muted)"),
              image: member.image || undefined,
              rank: club
                ? CLUB_POSITIONS.indexOf(club.position as ClubPosition)
                : CLUB_POSITIONS.length +
                  (moduleName && MODULES.includes(moduleName as ModuleName)
                    ? MODULES.indexOf(moduleName as ModuleName)
                    : MODULES.length),
            };
          })
          .sort((a, b) => a.rank - b.rank)
          .map(({ rank: _rank, ...face }) => face),
      }),
    ) as HomeData;
  });
}

export default async function Home({ searchParams }: Props) {
  const { error } = await searchParams;
  const isUnauthorized = error === "unauthorized";

  let data = EMPTY;
  try {
    data = await getHomeData();
  } catch (caught) {
    logger.error("Home page data failed", {
      route: "/",
      operation: "home_summary",
      ...errorToLogMetadata(caught),
    });
  }

  const stats = [
    { value: MODULES.length, label: "technical modules", tone: "" },
    {
      value: data.ongoingProjects,
      label: "projects in progress",
      tone: styles.statViolet,
    },
    {
      value: data.publishedPosts,
      label: "blog posts published",
      tone: styles.statLime,
    },
    {
      value: data.heads,
      label: `module heads, ${CURRENT_TENURE}`,
      tone: styles.statRed,
    },
  ];

  return (
    <div className={styles.page}>
      <ScrollProgress />

      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
            email: CLUB_EMAIL,
            address: { "@type": "PostalAddress", ...IITG_ADDRESS },
            sameAs: SOCIAL_PROFILES,
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE_NAME,
            url: SITE_URL,
            description: SITE_DESCRIPTION,
          },
        ]}
      />

      {isUnauthorized && (
        <div className={styles.errorBanner} role="alert">
          <strong>Access denied</strong>
          <span>Your account is not authorised to use this application.</span>
        </div>
      )}

      <section id="top" className={styles.hero}>
        <PrismHero />

        <div className={styles.heroCopy}>
          <p className={styles.heroKicker}>Five modules · learn by building</p>
          <p className={styles.heroWordmark}>
            Coding
            <br />
            Club
          </p>
          <h1 className={styles.heroTitle}>
            The heartbeat of technology and innovation at IIT Guwahati.
          </h1>
          <p className={styles.heroLead}>
            We build, we learn, and we excel together.
          </p>
          <div className={styles.heroActions}>
            <Link href="#modules" className={styles.heroPrimary}>
              Explore the modules
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link href="#partner" className={styles.heroSecondary}>
              Partner with us
            </Link>
          </div>
        </div>
      </section>

      <div className={styles.marquee} aria-hidden="true">
        <div className={styles.marqueeTrack}>
          {[0, 1].map((half) => (
            <div key={half} className={styles.marqueeHalf}>
              {MARQUEE.map((word) => (
                <span key={word} className={styles.marqueeItem}>
                  <span>{word}</span>
                  <span className={styles.marqueeSep}>:</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.stats}>
        {stats.map((stat) => (
          <Reveal key={stat.label} className={styles.stat}>
            <CountUp
              value={stat.value}
              className={`${styles.statValue} ${stat.tone}`}
            />
            <span className={styles.statLabel}>{stat.label}</span>
          </Reveal>
        ))}
        <Reveal className={`${styles.stat} ${styles.statBanded}`}>
          <span className={styles.statKicker}>Open to</span>
          <span className={styles.statWord}>All years</span>
          <span className={styles.statLabel}>
            creativity and drive are what matter
          </span>
        </Reveal>
      </div>

      <section id="modules" className={styles.section}>
        <Reveal className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Modules</h2>
          <p className={styles.sectionLead}>
            Pick a module, attend its sessions, learn and build with the people
            in it.
          </p>
        </Reveal>
        <div className={styles.modules}>
          {MODULES.map((moduleName, index) => (
            <Reveal
              key={moduleName}
              className={styles.module}
              delay={index}
              style={
                {
                  "--module-bar": MODULE_BARS[moduleName],
                  "--module-accent": MODULE_ACCENTS[moduleName],
                } as React.CSSProperties
              }
            >
              <span className={styles.moduleBar} aria-hidden="true" />
              <span className={styles.moduleIndex}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={styles.moduleName}>{moduleName}</h3>
              <p className={styles.moduleText}>
                {MODULE_DESCRIPTIONS[moduleName]}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {data.projects.length > 0 && (
        <section id="projects" className={styles.section}>
          <Reveal className={styles.sectionHead}>
            <div>
              <p className={styles.sectionKickerViolet}>
                What we&rsquo;re working on
              </p>
              <h2 className={styles.sectionTitle}>Projects</h2>
            </div>
            <Link href="/projects" className={styles.sectionLink}>
              All projects →
            </Link>
          </Reveal>
          <div className={styles.projectList}>
            {data.projects.map((project, index) => (
              <Reveal
                key={project.id}
                delay={index}
                style={
                  {
                    "--accent": tagAccent(project.module),
                  } as React.CSSProperties
                }
              >
                <div className={styles.projectRow}>
                  <span className={styles.projectIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.projectMain}>
                    <span className={styles.projectName}>{project.title}</span>
                    <span className={styles.projectMeta}>
                      <span className={styles.projectModule}>
                        {project.module}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>since {project.since}</span>
                    </span>
                  </span>
                  <span className={styles.projectText}>
                    {project.description}
                  </span>
                  {project.takeaways.length > 0 && (
                    <span className={styles.projectLearned}>
                      <span className={styles.projectLearnedLabel}>
                        Picked up along the way
                      </span>
                      <span className={styles.projectLearnedList}>
                        {project.takeaways.join(", ")}
                      </span>
                    </span>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {data.events.length > 0 && (
        <section id="events" className={styles.section}>
          <Reveal className={styles.sectionHead}>
            <div>
              <p className={styles.sectionKickerRed}>Join us at our</p>
              <h2 className={styles.sectionTitle}>Events</h2>
            </div>
            <Link href="/events" className={styles.sectionLink}>
              All events →
            </Link>
          </Reveal>
          <div className={styles.eventGrid}>
            {data.events.map((event, index) => (
              <Reveal
                key={event.id}
                delay={index}
                style={
                  { "--accent": tagAccent(event.module) } as React.CSSProperties
                }
              >
                <Link
                  href={`/events/${event.slug}`}
                  className={styles.eventCard}
                >
                  <span className={styles.eventPoster}>
                    {event.poster && (
                      <FocalImage
                        src={event.poster}
                        focalPoint={event.posterFocalPoint}
                        alt=""
                        width={520}
                        height={650}
                        sizes="(max-width: 1100px) 100vw, 33vw"
                        className={styles.eventPosterImage}
                      />
                    )}
                  </span>
                  <span className={styles.eventBody}>
                    <span className={styles.eventKicker}>
                      <span className={styles.eventModule}>{event.module}</span>
                      <span aria-hidden="true" className={styles.eventDot}>
                        ·
                      </span>
                      <span className={styles.eventStatus}>{event.status}</span>
                    </span>
                    <span className={styles.eventTitle}>{event.title}</span>
                    <span className={styles.eventText}>
                      {event.shortDescription}
                    </span>
                    <span className={styles.eventWhen}>{event.when}</span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {data.posts.length > 0 && (
        <section id="writing" className={styles.section}>
          <Reveal className={styles.sectionHead}>
            <div>
              <p className={styles.sectionKickerSky}>Latest from the blog</p>
              <h2 className={styles.sectionTitle}>Writing</h2>
            </div>
            <Link href="/blog" className={styles.sectionLink}>
              All posts →
            </Link>
          </Reveal>
          {data.posts.map((post, index) => (
            <Reveal
              key={post.id}
              delay={index}
              style={
                {
                  "--accent": tagAccent(post.tags[0] ?? ""),
                } as React.CSSProperties
              }
            >
              <Link href={`/blog/${post.slug}`} className={styles.postRow}>
                <span className={styles.postMain}>
                  <span className={styles.postTitle}>{post.title}</span>
                  {post.tags[0] && (
                    <span className={styles.postTag}>
                      {post.tags.join(" / ")}
                    </span>
                  )}
                </span>
                <span className={styles.postExcerpt}>{post.excerpt}</span>
                <span className={styles.postMeta}>
                  <span>{post.authors}</span>
                  <span>{post.date}</span>
                </span>
              </Link>
            </Reveal>
          ))}
        </section>
      )}

      {data.faces.length > 0 && (
        <section id="team" className={styles.section}>
          <Reveal className={styles.sectionHead}>
            <div>
              <p className={styles.sectionKickerEmber}>Who runs it</p>
              <h2 className={styles.sectionTitle}>Team</h2>
            </div>
            <Link href="/team" className={styles.sectionLink}>
              Full team →
            </Link>
          </Reveal>
          <div className={styles.faces}>
            {data.faces.map((face, index) => (
              <Reveal
                key={face.id}
                delay={index}
                style={{ "--accent": face.accent } as React.CSSProperties}
              >
                <Link href="/team" className={styles.face}>
                  {face.image && (
                    <CompatibleImage
                      src={face.image}
                      alt=""
                      width={320}
                      height={320}
                      sizes="(max-width: 640px) 33vw, 150px"
                      className={styles.faceImage}
                    />
                  )}
                  <span className={styles.faceInitial} aria-hidden="true">
                    {face.initial}
                  </span>
                  <span className={styles.faceVeil}>
                    <span className={styles.faceName}>{face.name}</span>
                    <span className={styles.faceRole}>{face.role}</span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section id="partner" className={styles.partner}>
        <div>
          <p className={styles.partnerKicker}>For companies and recruiters</p>
          <h2 className={styles.partnerTitle}>
            Hire from us.
            <br />
            Build with us.
          </h2>
          <p className={styles.partnerLead}>
            We run workshops, contests and semester-long builds with sponsors.
            Talk to us about recruiting, problem statements, or funding a
            hackathon.
          </p>
        </div>
        <div className={styles.partnerActions}>
          <a href={`mailto:${CLUB_EMAIL}`} className={styles.partnerAction}>
            {CLUB_EMAIL}
            <ArrowRight size={15} aria-hidden="true" />
          </a>
          <p className={styles.partnerNote}>
            Sponsor deck available on request
          </p>
        </div>
      </section>
    </div>
  );
}
