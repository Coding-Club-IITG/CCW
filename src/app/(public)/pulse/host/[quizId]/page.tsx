import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import PulseCoHostPanel from "@/components/pulse/PulseCoHostPanel";
import PulseSignInPrompt from "@/components/pulse/PulseSignInPrompt";
import BackLink from "@/components/shared/BackLink";
import InlineNotice from "@/components/shared/InlineNotice";
import { webEnv } from "@/lib/env/web";
import {
  PULSE_STATUS_LABELS,
  pulseErrorMessage,
} from "@/lib/pulse/constants";
import { getHostQuiz } from "@/lib/pulse/quizzes";

import styles from "./PulseHostQuiz.module.scss";

export const metadata: Metadata = {
  title: "Quiz Management | Pulse | Coding Club IITG",
  robots: { index: false, follow: false },
};

export default async function PulseHostQuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;

  const req = new Request(
    new URL(
      `/api/pulse/host/${encodeURIComponent(quizId)}`,
      webEnv.BASE_URL,
    ),
    { headers: await headers() },
  );

  const result = await getHostQuiz(req, quizId);

  if (!result.ok) {
    if (result.error.code === "PULSE_NOT_AUTHORIZED") {
      return (
        <div className={styles.page}>
          <div className={styles.backWrap}>
            <BackLink href="/pulse/host" label="Back to Host Dashboard" />
          </div>
          <PulseSignInPrompt
            callbackURL={`/pulse/host/${encodeURIComponent(quizId)}`}
          />
        </div>
      );
    }

    return (
      <div className={styles.page}>
        <div className={styles.backWrap}>
          <BackLink href="/pulse/host" label="Back to Host Dashboard" />
        </div>
        <div className={styles.errorState}>
          <InlineNotice tone="info">
            {pulseErrorMessage(result.error)}
          </InlineNotice>
          <Link href="/pulse/host" className={styles.backLink}>
            Return to Quizzes
          </Link>
        </div>
      </div>
    );
  }

  const quiz = result.data;
  const statusLabel = PULSE_STATUS_LABELS[quiz.status] ?? quiz.status;
  const roleLabel = quiz.accessRole === "owner" ? "Owner" : "Co-host";

  return (
    <div className={styles.page}>
      <div className={styles.backWrap}>
        <BackLink href="/pulse/host" label="Back to Host Dashboard" />
      </div>

      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Pulse Host View</p>
          <h1 className={styles.title}>{quiz.title}</h1>
          <p className={styles.lead}>
            Prepare questions and manage session co-hosts.
          </p>
        </div>

        <div className={styles.headerMeta}>
          <span
            className={`${styles.statusBadge} ${styles[quiz.status] || ""}`}
          >
            {statusLabel}
          </span>
          <span className={styles.roleBadge}>{roleLabel}</span>
        </div>
      </header>

      <div className={styles.cardGrid}>
        <div className={styles.overviewCard}>
          <h2 className={styles.cardHeading}>Quiz Overview</h2>
          <dl className={styles.detailList}>
            <dt>Room Code</dt>
            <dd>
              <strong className={styles.mono}>{quiz.roomCode}</strong>
            </dd>

            <dt>Owner Email</dt>
            <dd className={styles.mono}>
              {quiz.owner.email ?? "Not assigned"}
            </dd>

            <dt>Owner Status</dt>
            <dd>
              {quiz.owner.linkedAt ? "Linked" : "Pending first sign-in"}
            </dd>

            <dt>Status</dt>
            <dd>{statusLabel}</dd>
          </dl>
        </div>

        <PulseCoHostPanel
          quizId={quiz.id}
          initialCoHosts={quiz.coHosts}
          accessRole={quiz.accessRole}
          apiBase="/api/pulse/host"
        />
      </div>
    </div>
  );
}
