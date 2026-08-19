import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCreatableCalendarScopes } from "@/lib/access/calendar";
import { parseManagedModules } from "@/lib/roles";
import BackLink from "@/components/shared/BackLink";
import CalendarEventForm from "@/components/calendar/CalendarEventForm";
import styles from "../Calendar.module.scss";

export default async function NewCalendarEventPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session!.user as { access?: string; managedModules?: unknown };
  const scopes = getCreatableCalendarScopes(
    user.access,
    parseManagedModules(user.managedModules),
  );
  if (scopes.length === 0) redirect("/internal/calendar");
  return (
    <div className={`${styles.container} ${styles.formPage}`}>
      <BackLink href="/internal/calendar" label="Back to Calendar" />
      <h1 className={styles.pageTitle}>Create calendar event</h1>
      <CalendarEventForm scopes={scopes} />
    </div>
  );
}
