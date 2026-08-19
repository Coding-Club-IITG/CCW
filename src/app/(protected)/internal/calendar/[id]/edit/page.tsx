import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  canManageCalendarEvent,
  getCreatableCalendarScopes,
} from "@/lib/access/calendar";
import dbConnect from "@/lib/mongodb";
import { parseManagedModules } from "@/lib/roles";
import CalendarEvent from "@/models/CalendarEvent";
import BackLink from "@/components/shared/BackLink";
import CalendarEventForm from "@/components/calendar/CalendarEventForm";
import styles from "../../Calendar.module.scss";

export default async function EditCalendarEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  await dbConnect();
  const event = await CalendarEvent.findById(id).lean();
  if (!event) notFound();
  const user = session!.user as { access?: string; managedModules?: unknown };
  const roles = parseManagedModules(user.managedModules);
  const target =
    event.scope === "module"
      ? { scope: "module" as const, module: event.module ?? "" }
      : { scope: "general" as const };
  if (!canManageCalendarEvent(user.access, roles, target))
    redirect(`/internal/calendar/${id}`);
  const scopes = getCreatableCalendarScopes(user.access, roles);
  return (
    <div className={`${styles.container} ${styles.formPage}`}>
      <BackLink
        href={`/internal/calendar/${id}`}
        label="Back to Calendar Event"
      />
      <h1 className={styles.pageTitle}>Edit calendar event</h1>
      <CalendarEventForm
        scopes={scopes}
        initialEvent={{
          _id: String(event._id),
          title: event.title,
          description: event.description,
          scope: event.scope,
          module: event.module,
          allDay: event.allDay,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt?.toISOString(),
          recurrenceType: event.recurrenceType,
          recurrenceCount: event.recurrenceCount,
          location: event.location,
          externalUrl: event.externalUrl,
          agenda: event.agenda,
          minutes: event.minutes,
          remindOneDayBefore: event.remindOneDayBefore,
        }}
      />
    </div>
  );
}
