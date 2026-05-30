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
          href="/admin"
          title="Global Settings"
          description="Club-wide announcements and maintenance settings (Coming Soon)."
        />
      </div>
    </div>
  );
}
