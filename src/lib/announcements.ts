export interface Announcement {
  title: string;
  eyebrow?: string;
  description: string;
  detail?: string;
  action: {
    label: string;
    href: string;
    external?: boolean;
  };
  startsAt?: string;
  endsAt?: string;
}

// Set to null to remove the announcement
export const SITE_ANNOUNCEMENT: Announcement | null = {
  title: "Club Recruitment",
  eyebrow: "2026 Winter",
  description:
    "We will recruit new members this December. Keep an eye on the recruitment page for more details.",
  detail: "",
  action: {
    label: "View recruitment page",
    href: "/recruitment",
  },
  startsAt: "2026-11-01T00:00:00+05:30",
  endsAt: "2027-01-01T00:00:00+05:30",
};

export function getSiteAnnouncement(now = Date.now()): Announcement | null {
  const announcement = SITE_ANNOUNCEMENT;
  if (!announcement) return null;

  if (
    (announcement.startsAt && now < Date.parse(announcement.startsAt)) ||
    (announcement.endsAt && now >= Date.parse(announcement.endsAt))
  ) {
    return null;
  }

  return announcement;
}
