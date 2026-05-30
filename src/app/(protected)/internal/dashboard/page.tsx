import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isAdmin } from "@/lib/roles";
import styles from "./Dashboard.module.scss";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // session is guaranteed by proxy
  const user = session!.user as any;
  const moduleRoles = user.moduleRoles || [];

  return (
    <div className={styles.container}>
      <h1>Member Dashboard</h1>
      <p className={styles.welcome}>Welcome back, {user.name}!</p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Your Roles</h3>
          <ul>
            <li>Global Role: {user.role}</li>
            {moduleRoles.map((mr: any, i: number) => (
              <li key={i}>
                {mr.module}
                {mr.role ? `: ${mr.role}` : ""}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.card}>
          <h3>Quick Links</h3>
          <ul>
            {isAdmin(user.role) && (
              <li>
                <a href="/admin">Website Administration</a>
              </li>
            )}
            <li>
              <a href="/internal/profile">Update Profile</a>
            </li>
            <li>
              <a href="/internal/files">Files Sharing</a>
            </li>
            <li>
              <a href="/internal/cp">Competitive Programming</a>
            </li>
            <li>
              <a href="/internal/potd">Problem of the Day</a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
