/* Global Clients */
/* Web Push worker */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Coding Club IITG", {
      body: data.message || "You have a new notification.",
      // TODO: Notification icon
      icon: data.icon || "/icons/cc-192.png",
      tag: data.tag,
      data: { link: data.link || "/internal/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL("/internal/notifications", self.location.origin);
  try {
    const candidate = new URL(
      event.notification.data?.link,
      self.location.origin,
    );
    if (candidate.origin === self.location.origin) target = candidate;
  } catch {
    // Retain the notifications-page fallback
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const existing = windows[0];
        if (existing) {
          if ("navigate" in existing) await existing.navigate(target.href);
          return existing.focus();
        }
        return clients.openWindow(target.href);
      }),
  );
});
