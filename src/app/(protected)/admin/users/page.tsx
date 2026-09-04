import UserManagement from "@/components/admin/UserManagement";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import styles from "./Users.module.scss";

export default async function AdminUsersPage() {
  return (
    <div>
      <AdminPageHeader
        title="User Management"
        lead="Manage members, assign roles, and configure module permissions."
      />

      <section className={styles.section}>
        <UserManagement />
      </section>
    </div>
  );
}
