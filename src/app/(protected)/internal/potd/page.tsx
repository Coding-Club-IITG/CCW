import { getTodayChallenge } from "@/lib/actions/potd";
import { getCPStatus } from "@/lib/actions/cp-status";
import DailyChallengeClient from "./DailyChallengeClient";
import styles from "./Potd.module.scss";

export default async function PotdPage() {
  const cpStatusResult = await getCPStatus();
  const cfVerified = cpStatusResult.ok
    ? (cpStatusResult.cfVerified ?? false)
    : false;
  const acVerified = cpStatusResult.ok
    ? (cpStatusResult.acVerified ?? false)
    : false;

  const challengeResult = await getTodayChallenge();

  return (
    <div>
      <header className={styles.pageHeader}>
        <h1>Daily Challenge</h1>
      </header>
      <DailyChallengeClient
        cfVerified={cfVerified}
        acVerified={acVerified}
        initialData={challengeResult.data ?? null}
      />
    </div>
  );
}
