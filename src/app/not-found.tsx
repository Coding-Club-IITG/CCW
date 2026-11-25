import Navbar from "@/components/layout/Navbar/Navbar";
import Footer from "@/components/layout/Footer/Footer";

import NotFoundContent from "./NotFoundContent";
import styles from "./not-found.module.scss";

export default function NotFound() {
  return (
    <div className={styles.shell}>
      <Navbar />
      <main className={styles.stage}>
        <NotFoundContent />
      </main>
      <Footer />
    </div>
  );
}
