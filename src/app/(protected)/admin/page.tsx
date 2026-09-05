import {
  BellRing,
  CalendarDays,
  FileCode2,
  Newspaper,
  Rocket,
  SlidersHorizontal,
  Trophy,
  UsersRound,
  ScrollText,
} from "lucide-react";

import LinkCard from "@/components/shared/LinkCard";
import styles from "./Admin.module.scss";

export default async function AdminPage() {
  return (
    <div>
      <header className={styles.header}>
        <h1>CCW Administration</h1>
        <p>Manage the Coding Club website.</p>
      </header>

      <div className={styles.grid}>
        <LinkCard
          href="/admin/audit-log"
          title="Audit Log"
          description="Review privileged changes made."
          icon={<ScrollText size={18} />}
        />
        <LinkCard
          href="/admin/users"
          title="User Management"
          description="Manage members, assign club positions, and configure module permissions."
          icon={<UsersRound size={18} />}
        />
        <LinkCard
          href="/admin/notifications"
          title="Send Notifications"
          description="Broadcast announcements to all members or specific modules."
          icon={<BellRing size={18} />}
        />
        <LinkCard
          href="/admin/blog"
          title="Blog Management"
          description="Create, edit, and publish blog posts for the community."
          icon={<Newspaper size={18} />}
        />
        <LinkCard
          href="/admin/events"
          title="Public Events"
          description="Manage club events linked to the calendar."
          icon={<CalendarDays size={18} />}
        />
        <LinkCard
          href="/admin/projects"
          title="Project Management"
          description="Manage showcase projects, repository links, and cover images."
          icon={<FileCode2 size={18} />}
        />
        <LinkCard
          href="/admin/recruitment"
          title="Recruitment"
          description="Configure Coding Week editions, schedules, resources and tasks."
          icon={<UsersRound size={18} />}
        />
        <LinkCard
          href="/admin/hackathons"
          title="Hackathon Management"
          description="Create hackathons and monitor team registrations."
          icon={<Rocket size={18} />}
        />
        <LinkCard
          href="/admin/contests/presets"
          title="Contest Presets"
          description="Manage presets, platforms, and problem selections for contests."
          icon={<SlidersHorizontal size={18} />}
        />
        <LinkCard
          href="/admin/contests/new"
          title="Create Tournament"
          description="Build new knockout tournament brackets and set up registration deadlines."
          icon={<Trophy size={18} />}
        />
      </div>
    </div>
  );
}
