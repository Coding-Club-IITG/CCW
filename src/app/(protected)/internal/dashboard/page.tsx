import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isAdmin } from "@/lib/roles";
import LinkCard from "@/components/shared/LinkCard";
import { getDisplayName } from "@/lib/utils";
import styles from "./Dashboard.module.scss";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // session is guaranteed by proxy
  const user = session!.user as any;

  return (
    <div className={styles.container}>
      <h1>Member Dashboard</h1>
      <p className={styles.welcome}>
        Welcome back, {getDisplayName(user.name, user.pizza_count)}!
      </p>

      <h2 className={styles.sectionTitle}>Quick Links</h2>
      <div className={styles.grid}>
        {isAdmin(user.role) && (
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
    </div>
  );
}
