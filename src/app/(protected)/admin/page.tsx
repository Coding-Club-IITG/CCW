import LinkCard from "@/components/shared/LinkCard";
import styles from "./Admin.module.scss";

export default async function AdminPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>CCW Administration</h1>
        <p>Manage the Coding Club website.</p>
      </header>

      <div className={styles.grid}>
        <LinkCard
          href="/admin/users"
          title="User Management"
          description="Manage members, assign global roles, and configure module permissions."
        />
        <LinkCard
          href="/admin/blog"
          title="Blog Management"
          description="Create, edit, and publish blog posts for the community."
        />
        <LinkCard
          href="/admin/events"
          title="Public Events"
          description="Manage club events linked to the calendar."
        />
        <LinkCard
          href="/admin/projects"
          title="Project Management"
          description="Manage showcase projects, repository links, and cover images."
        />
        <LinkCard
          href="/admin/hackathons"
          title="Hackathon Management"
          description="Create hackathons and monitor team registrations."
        />
        <LinkCard
          href="/admin/notifications"
          title="Send Notifications"
          description="Broadcast announcements to all members or specific modules."
        />
        <LinkCard
          href="/admin/contests/presets"
          title="Contest Presets"
          description="Manage presets, platforms, and problem selections for contests."
        />
        <LinkCard
          href="/admin/contests/new"
          title="Create Tournament"
          description="Build new knockout tournament brackets and set up registration deadlines."
        />
      </div>
    </div>
  );
}
