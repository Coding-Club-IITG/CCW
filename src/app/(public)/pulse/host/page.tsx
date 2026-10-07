import type { Metadata } from "next";
import { headers } from "next/headers";

import PulseHostList from "@/components/pulse/PulseHostList";
import PulseSignInPrompt from "@/components/pulse/PulseSignInPrompt";
import { auth } from "@/lib/auth";

import styles from "./PulseHost.module.scss";

export const metadata: Metadata = {
  title: "Host Quizzes | Pulse | Coding Club IITG",
  robots: { index: false, follow: false },
};

export default async function PulseHostPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Pulse</p>
        <h1 className={styles.title}>Host Dashboard</h1>
        <p className={styles.lead}>
          Manage and launch your assigned Pulse quizzes.
        </p>
      </header>

      {!session ? (
        <div className={styles.authNotice}>
          <PulseSignInPrompt callbackURL="/pulse/host" />
        </div>
      ) : (
        <PulseHostList />
      )}
    </div>
  );
}
