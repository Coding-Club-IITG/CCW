import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canPublishCalendarEvent } from "@/lib/calendarAccess";
import { parseModuleRoles } from "@/lib/roles";
import dbConnect from "@/lib/mongodb";
import CalendarEvent from "@/models/CalendarEvent";
import BackLink from "@/components/shared/BackLink";
import PublicEventForm from "@/components/calendar/PublicEventForm";
import styles from "./EventForm.module.scss";

export default async function NewPublicEventPage({
  searchParams,
}: {
  searchParams: Promise<{ calendarEventId?: string }>;
}) {
  const { calendarEventId } = await searchParams;
  if (!calendarEventId) redirect("/internal/calendar/new");
  const session = await auth.api.getSession({ headers: await headers() });
  await dbConnect();
  const calendar = await CalendarEvent.findById(calendarEventId).lean();
  if (!calendar) notFound();
  const user = session!.user as { role?: string; moduleRoles?: unknown };
  const target =
    calendar.scope === "module"
      ? { scope: "module" as const, module: calendar.module ?? "" }
      : { scope: "general" as const };
  if (
    !canPublishCalendarEvent(
      user.role,
      parseModuleRoles(user.moduleRoles),
      target,
    )
  )
    redirect(`/internal/calendar/${calendarEventId}`);
  if (calendar.publicEventId)
    redirect(`/admin/events/${calendar.publicEventId}`);
  return (
    <div className={styles.container}>
      <BackLink
        href={`/internal/calendar/${calendarEventId}`}
        label="Back to Calendar Event"
      />
      <h1 className={styles.pageTitle}>Create public event</h1>
      <PublicEventForm
        calendarEventId={calendarEventId}
        calendarTitle={calendar.title}
        calendarDescription={calendar.description}
      />
    </div>
  );
}
