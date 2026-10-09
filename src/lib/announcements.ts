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
  title: "Hello FOSS 2026",
  eyebrow: "Pan-IIT open source initiative",
  description: "Build real projects with students and mentors across IITs.",
  detail: "Contributions through 12 Nov",
  action: {
    label: "Explore Hello FOSS",
    href: "https://hellofoss.tech-iitb.org/",
    external: true,
  },
  startsAt: "2026-10-07T18:30:00.000Z",
  endsAt: "2026-11-12T18:30:00.000Z",
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
