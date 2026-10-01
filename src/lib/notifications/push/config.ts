import { sharedServerEnv } from "@/lib/env/shared";

export const webPushConfigured = Boolean(
  sharedServerEnv.WEB_PUSH_PUBLIC_KEY &&
  sharedServerEnv.WEB_PUSH_PRIVATE_KEY &&
  sharedServerEnv.WEB_PUSH_SUBJECT,
);

export function getWebPushConfig() {
  if (!webPushConfigured) return null;
  return {
    publicKey: sharedServerEnv.WEB_PUSH_PUBLIC_KEY as string,
    privateKey: sharedServerEnv.WEB_PUSH_PRIVATE_KEY as string,
    subject: sharedServerEnv.WEB_PUSH_SUBJECT as string,
  };
}
