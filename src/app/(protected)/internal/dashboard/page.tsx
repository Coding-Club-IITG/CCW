import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";
import dbConnect from "@/lib/mongodb";
import { isHead } from "@/lib/roles";
import LinkCard from "@/components/shared/LinkCard";
import { IconEdit } from "@/components/shared/Icons";
import { getDisplayName } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";
import styles from "./Dashboard.module.scss";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // session is guaranteed by proxy
  const user = session!.user as any;
  const userIsAdmin = isHead(user.access);

  await dbConnect();
  const myBlogs = await BlogPost.find({
    "authors.userId": user.id,
  })
    .select("title slug excerpt status updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Member Dashboard</h1>
        <p>Welcome back, {getDisplayName(user.name, user.pizza_count)}!</p>
      </header>

      <h2 className={styles.sectionTitle}>Quick Links</h2>
      <div className={styles.grid}>
        {userIsAdmin && (
          <LinkCard
            href="/admin"
            title="Website Administration"
            description="Manage website settings."
          />
        )}
        <LinkCard
          href="/internal/profile"
          title="Update Profile"
          description="Edit your display name, bio, and linked platform handles."
        />
        <LinkCard
          href="/internal/calendar"
          title="Club Calendar"
          description="See general and module events, agendas, and meeting minutes."
        />
        <LinkCard
          href="/internal/files"
          title="File Sharing"
          description="Access shared resources, notes, and module materials."
        />
        <LinkCard
          href="/internal/cp"
          title="Competitive Programming"
          description="Leaderboards, contests, and your CP performance tracker."
        />
        <LinkCard
          href="/internal/contests"
          title="Contests & Arena"
          description="Compete in live coding contests and 1v1 arenas."
        />
        <LinkCard
          href="/internal/potd"
          title="Problem of the Day"
          description="Daily coding challenges, streaks, and submissions."
        />
        <LinkCard
          href="/internal/hackathons"
          title="Hackathon Finder"
          description="Find active hackathons and build your team."
        />
      </div>

      {myBlogs.length > 0 && (
        <>
          <h2 className={styles.myBlogsTitle}>My Blogs</h2>
          <div className={styles.grid}>
            {myBlogs.map((post) => {
              const isDraft = post.status === "draft";
              const canEdit = userIsAdmin || isDraft;
              const editHref = userIsAdmin
                ? `/admin/blog/${post.slug}/edit`
                : `/internal/blog/${post.slug}/edit`;

              return (
                <article key={String(post._id)} className={styles.blogCard}>
                  <div className={styles.blogCardHeader}>
                    {isDraft ? (
                      <h3 className={styles.blogTitle}>{post.title}</h3>
                    ) : (
                      <Link
                        href={`/blog/${post.slug}`}
                        className={styles.blogTitleLink}
                      >
                        {post.title}
                      </Link>
                    )}
                    {canEdit && (
                      <Link
                        href={editHref}
                        className={styles.editBlogLink}
                        aria-label={`Edit ${post.title}`}
                        title="Edit blog"
                      >
                        <IconEdit width={16} height={16} />
                      </Link>
                    )}
                  </div>
                  <p className={styles.blogDescription}>
                    {post.excerpt ||
                      (isDraft
                        ? "Blog draft"
                        : "Read this published blog post.")}
                  </p>
                  <span className={styles.blogStatus}>{post.status}</span>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
