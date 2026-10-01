import { expectAppData } from "@/lib/api/result";

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function supportsPushNotifications() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function requiresIosInstallation() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && navigatorWithStandalone.standalone !== true;
}

export async function getCurrentPushSubscription() {
  if (!supportsPushNotifications()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.pushManager.getSubscription() ?? null;
}

export async function enablePushNotifications(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.register("/push-sw.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await syncPushSubscription(subscription);
  return subscription;
}

export async function syncPushSubscription(subscription: PushSubscription) {
  await expectAppData(
    await fetch("/api/push-subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    }),
  );
}

export async function disablePushNotifications(signal?: AbortSignal) {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;

  try {
    await expectAppData(
      await fetch("/api/push-subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
        signal,
      }),
    );
  } finally {
    await subscription.unsubscribe();
  }
}

export async function cleanupPushBeforeLogout() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3000);
  try {
    await disablePushNotifications(controller.signal);
  } catch {
    // Logout remains available when browser or server cleanup fails
  } finally {
    window.clearTimeout(timeout);
  }
}
