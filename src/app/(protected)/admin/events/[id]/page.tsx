import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { buildScheduleFingerprint } from "@/lib/calendar";
import { canPublishCalendarEvent } from "@/lib/access/calendar";
import dbConnect from "@/lib/mongodb";
import { parseManagedModules } from "@/lib/roles";
import CalendarEvent from "@/models/CalendarEvent";
import Event from "@/models/Event";
import BackLink from "@/components/shared/BackLink";
import PublicEventForm from "@/components/calendar/PublicEventForm";
import styles from "../EventForm.module.scss";

export default async function EditPublicEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  await dbConnect();
  const event = await Event.findById(id).lean();
  if (!event) notFound();
  const calendar = await CalendarEvent.findById(event.calendarEventId).lean();
  if (!calendar) notFound();
  const user = session!.user as { access?: string; managedModules?: unknown };
  const target =
    calendar.scope === "module"
      ? { scope: "module" as const, module: calendar.module ?? "" }
      : { scope: "general" as const };
  if (
    !canPublishCalendarEvent(
      user.access,
      parseManagedModules(user.managedModules),
      target,
    )
  )
    redirect("/admin/events");
  const fingerprint = buildScheduleFingerprint(calendar);
  return (
    <div className={styles.container}>
      <BackLink href="/admin/events" label="Back to Public Events" />
      <h1 className={styles.pageTitle}>Edit public event</h1>
      <PublicEventForm
        calendarEventId={String(calendar._id)}
        calendarTitle={calendar.title}
        calendarDescription={calendar.description}
        event={{
          _id: String(event._id),
          title: event.title,
          shortDescription: event.shortDescription,
          description: event.description,
          poster: event.poster,
          posterFocalPoint: event.posterFocalPoint,
          tags: event.tags,
          status: event.status,
        }}
        outOfSync={event.scheduleFingerprint !== fingerprint}
      />
    </div>
  );
}
