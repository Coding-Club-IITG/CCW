import UserManagement from "@/components/admin/UserManagement";
import styles from "./Admin.module.scss";

export default async function AdminPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>CCW Administration</h1>
        <p>User management and global settings for the Coding Club website.</p>
      </header>

      <section className={styles.section}>
        <h2>User & Role Management</h2>
        <UserManagement />
      </section>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Global Settings</h3>
          <p>Club-wide announcements and maintenance settings (Coming Soon)</p>
        </div>
        <div className={styles.card}>
          <h3>Audit Logs</h3>
          <p>Track administrative changes and user logins (Coming Soon)</p>
        </div>
      </div>
    </div>
  );
}
