import NotFoundContent from "../NotFoundContent";
import styles from "../not-found.module.scss";

export default function PublicNotFound() {
  return (
    <section className={styles.stage}>
      <NotFoundContent />
    </section>
  );
}
