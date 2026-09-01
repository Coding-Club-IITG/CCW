import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  CalendarDays,
  Code2,
  FileText,
  Flame,
  Home,
  Moon,
  Newspaper,
  Rocket,
  Search,
  ShieldCheck,
  Sun,
  Swords,
  UserRound,
  UsersRound,
} from "lucide-react";
import { MODULE_DESCRIPTIONS, MODULES } from "@/lib/constants";
import type { AtlasResult } from "@/lib/atlas/types";

export type AtlasCatalogItem = AtlasResult & { icon: LucideIcon };

const PUBLIC_ROUTES: AtlasCatalogItem[] = [
  ["home", "Home", "/", Home],
  ["blog", "Blog", "/blog", Newspaper],
  ["events", "Events", "/events", CalendarDays],
  ["projects", "Projects", "/projects", Code2],
  ["team", "Team", "/team", UsersRound],
].map(([id, title, href, icon]) => ({
  id: String(id),
  kind: "route",
  title: String(title),
  href: String(href),
  icon: icon as LucideIcon,
  description: `Open ${title}`,
  internal: false,
  matchReason: "Site route",
  score: 60,
}));

const INTERNAL_ROUTES: AtlasCatalogItem[] = [
  ["dashboard", "Member Dashboard", "/internal/dashboard", Home],
  ["profile", "Profile", "/internal/profile", UserRound],
  ["calendar", "Club Calendar", "/internal/calendar", CalendarDays],
  ["files", "Shared Files", "/internal/files", FileText],
  ["cp", "Competitive Programming", "/internal/cp", Code2],
  ["potd", "Problem of the Day", "/internal/potd", Flame],
  ["contests", "Contests & Arena", "/internal/contests", Swords],
  ["hackathons", "Hackathon Finder", "/internal/hackathons", Rocket],
  ["notifications", "Notifications", "/internal/notifications", BellRing],
].map(([id, title, href, icon]) => ({
  id: String(id),
  kind: "route",
  title: String(title),
  href: String(href),
  icon: icon as LucideIcon,
  description: `Open ${title}`,
  internal: true,
  matchReason: "Member route",
  score: 60,
}));

const ADMIN_ROUTES: AtlasCatalogItem[] = [
  ["admin", "Website Administration", "/admin"],
  ["admin-users", "Manage members", "/admin/users"],
  ["admin-blog", "Manage blog posts", "/admin/blog"],
  ["admin-events", "Manage public events", "/admin/events"],
  ["admin-projects", "Manage projects", "/admin/projects"],
  ["admin-hackathons", "Manage hackathons", "/admin/hackathons"],
  ["admin-notifications", "Send notifications", "/admin/notifications"],
  ["new-calendar", "Create calendar event", "/internal/calendar/new"],
  ["new-project", "Create project", "/admin/projects/new"],
  ["new-contest", "Create tournament", "/admin/contests/new"],
].map(([id, title, href]) => ({
  id,
  kind: "route" as const,
  title,
  href,
  icon: ShieldCheck,
  description: `Authorized launcher · ${title}`,
  internal: true,
  matchReason: "Available for your role",
  score: 65,
}));

export function atlasCatalog(options: {
  signedIn: boolean;
  head: boolean;
  canSetPotd: boolean;
  theme: "light" | "dark";
}): AtlasCatalogItem[] {
  const modules: AtlasCatalogItem[] = MODULES.map((module) => ({
    id: module,
    kind: "module",
    title: module,
    description: MODULE_DESCRIPTIONS[module],
    internal: false,
    matchReason: "Club module",
    score: 75,
    icon: Search,
  }));
  const commands: AtlasCatalogItem[] = [
    {
      id: "toggle-theme",
      kind: "command",
      title: `Use ${options.theme === "dark" ? "light" : "dark"} theme`,
      description: "Switch the site theme",
      internal: false,
      matchReason: "Site command",
      score: 55,
      icon: options.theme === "dark" ? Sun : Moon,
      actions: [{ label: "Run", command: "toggle-theme" }],
    },
  ];
  if (options.signedIn) {
    commands.push({
      id: "toggle-view",
      kind: "command",
      title: "Switch public/internal view",
      description: "Change the navigation view",
      internal: true,
      matchReason: "Member command",
      score: 55,
      icon: UsersRound,
      actions: [{ label: "Run", command: "toggle-view" }],
    });
  }
  const potd = options.canSetPotd
    ? [
        {
          id: "set-potd",
          kind: "route" as const,
          title: "Set Problem of the Day",
          href: "/internal/potd/set-problem",
          description: "Authorized POTD launcher",
          internal: true,
          matchReason: "Available for your role",
          score: 65,
          icon: Flame,
        },
      ]
    : [];
  return [
    ...PUBLIC_ROUTES,
    ...(options.signedIn ? INTERNAL_ROUTES : []),
    ...(options.head ? ADMIN_ROUTES : []),
    ...potd,
    ...modules,
    ...commands,
  ];
}
