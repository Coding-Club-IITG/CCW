import {
  CircleAlert as IconWarning,
  CircleCheck as IconCheckCircle,
  Gavel as IconGavel,
  Info as IconInfoCircle,
  Lock as IconLock,
  RefreshCw as IconSwitchView,
  User as IconUsers,
  UserX as IconPersonOff,
} from "lucide-react";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* Icons for browser desktop notifications matching activity feed */
const NOTIFICATION_ICON_MAP: Record<
  string,
  { component: React.FC<React.SVGProps<SVGSVGElement>>; color: string }
> = {
  info: { component: IconInfoCircle, color: "#8b5cf6" },
  gavel: { component: IconGavel, color: "#ef4444" },
  lock: { component: IconLock, color: "#8b5cf6" },
  sync: { component: IconSwitchView, color: "#06b6d4" },
  check_circle: { component: IconCheckCircle, color: "#22c55e" },
  error: { component: IconWarning, color: "#ef4444" },
  person: { component: IconUsers, color: "#06b6d4" },
  person_off: { component: IconPersonOff, color: "#ef4444" },
};

function getNotificationIconUri(icon: string): string {
  const entry = NOTIFICATION_ICON_MAP[icon] ?? NOTIFICATION_ICON_MAP.info;
  const svg = renderToStaticMarkup(
    createElement(entry.component, {
      width: 24,
      height: 24,
      stroke: entry.color,
    }),
  );
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Best-effort desktop notification for a live room event */
export function sendBrowserNotification(icon: string, text: string) {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  )
    return;
  try {
    new Notification("CCW Match", {
      body: text,
      icon: getNotificationIconUri(icon),
      silent: true,
    });
  } catch (_) {}
}
