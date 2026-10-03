import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ROOM_ACTIVITY_ICONS } from "./roomActivityIcons";

function getNotificationIconUri(icon: string): string {
  const component = ROOM_ACTIVITY_ICONS[icon] ?? ROOM_ACTIVITY_ICONS.info;
  const token = ["gavel", "error", "person_off"].includes(icon)
    ? "--danger"
    : icon === "check_circle"
      ? "--success"
      : "--primary";
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  const svg = renderToStaticMarkup(
    createElement(component, {
      width: 24,
      height: 24,
      stroke: color,
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
  } catch {
    // Browsers can reject notifications after permission changes
  }
}
