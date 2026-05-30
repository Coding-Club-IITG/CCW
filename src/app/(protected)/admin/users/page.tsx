import UserManagement from "@/components/admin/UserManagement";
import BackLink from "@/components/BackLink";
import styles from "./Users.module.scss";

export default async function AdminUsersPage() {
  return (
    <div className={styles.container}>
      <BackLink href="/admin" label="Back to Administration" />

      <header className={styles.header}>
        <h1>User Management</h1>
        <p>Manage members, assign roles, and configure module permissions.</p>
      </header>

      <section className={styles.section}>
        <UserManagement />
      </section>
    </div>
  );
}
