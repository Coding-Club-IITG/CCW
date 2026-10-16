import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import PulseDeckEditor from "@/components/pulse/editor/PulseDeckEditor";
import PulseSignInPrompt from "@/components/pulse/PulseSignInPrompt";
import BackLink from "@/components/shared/BackLink";
import InlineNotice from "@/components/shared/InlineNotice";
import { webEnv } from "@/lib/env/web";
import { pulseErrorMessage } from "@/lib/pulse/constants";
import { getDeck } from "@/lib/pulse/deckService";

import styles from "../PulseHostQuiz.module.scss";

export const metadata: Metadata = {
  title: "Deck Editor | Pulse | Coding Club IITG",
  robots: { index: false, follow: false },
};

export default async function PulseDeckEditorPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  const backHref = `/pulse/host/${encodeURIComponent(quizId)}`;

  const req = new Request(
    new URL(`/api/pulse/host/${encodeURIComponent(quizId)}/deck`, webEnv.BASE_URL),
    { headers: await headers() },
  );
  const result = await getDeck(req, quizId);

  if (!result.ok) {
    return (
      <div className={styles.page}>
        <div className={styles.backWrap}>
          <BackLink href="/pulse/host" label="Back to Host Dashboard" />
        </div>
        {result.error.code === "PULSE_NOT_AUTHORIZED" ? (
          <PulseSignInPrompt callbackURL={`${backHref}/edit`} />
        ) : (
          <div className={styles.errorState}>
            <InlineNotice tone="info">{pulseErrorMessage(result.error)}</InlineNotice>
            <Link href="/pulse/host" className={styles.backLink}>
              Return to Quizzes
            </Link>
          </div>
        )}
      </div>
    );
  }

  return <PulseDeckEditor quizId={quizId} initialDeck={result.data} />;
}
