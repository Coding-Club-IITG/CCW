import type { Metadata } from "next";
import Link from "next/link";

import Button from "@/components/shared/Button";
import { ROOM_CODE_LENGTH } from "@/lib/pulse/constants";

import styles from "./PulseLanding.module.scss";

export const metadata: Metadata = {
  title: "Pulse | Coding Club IITG",
  description: "Interactive real-time quizzes and presentations for Coding Club IITG.",
};

export default function PulseLandingPage() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <header className={styles.header}>
          <p className={styles.kicker}>Pulse</p>
          <h1 className={styles.title}>Interactive Quizzes</h1>
          <p className={styles.lead}>
            Join an ongoing session or host a quiz for your audience.
          </p>
        </header>

        <section className={styles.section} aria-labelledby="join-heading">
          <h2 id="join-heading" className="sr-only">
            Join Room
          </h2>
          <form className={styles.joinForm}>
            <div className={styles.inputGroup}>
              <label htmlFor="room-code-input" className={styles.label}>
                Room Code
              </label>
              <input
                id="room-code-input"
                type="text"
                className={styles.input}
                placeholder="6-LETTER CODE"
                maxLength={ROOM_CODE_LENGTH}
                autoComplete="off"
                spellCheck="false"
                aria-describedby="room-code-hint"
              />
            </div>
            <p id="room-code-hint" className={styles.hint}>
              Room joining will be enabled in a future release.
            </p>
            <Button
              variant="primary"
              type="submit"
              disabled
              aria-disabled="true"
            >
              Join Room
            </Button>
          </form>
        </section>

        <div className={styles.divider} aria-hidden="true">
          <span>or</span>
        </div>

        <section className={styles.hostAction} aria-labelledby="host-heading">
          <h2 id="host-heading" className="sr-only">
            Host Room
          </h2>
          <Link href="/pulse/host" className={styles.hostLink}>
            Host Room
          </Link>
        </section>
      </main>
    </div>
  );
}
