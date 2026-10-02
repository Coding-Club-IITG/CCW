import { PUBLIC_ANALYTICS_PAGES } from "@/lib/constants";

/** Only public paths */
export function isPublicAnalyticsPage(path: string): boolean {
  return (
    (PUBLIC_ANALYTICS_PAGES.some((page) => page === path) ||
      /^\/(?:blog|events)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) &&
    path.length <= 256
  );
}
