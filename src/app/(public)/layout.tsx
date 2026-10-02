import { publicAnalyticsEnabled } from "@/lib/telemetry/publicPageViews";

import Navbar from "@/components/layout/Navbar/Navbar";
import Footer from "@/components/layout/Footer/Footer";
import PublicPageTracker from "@/components/public/PublicPageTracker";
import styles from "./layout.module.scss";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={styles.shell}>
      {publicAnalyticsEnabled() && <PublicPageTracker />}
      <Navbar />
      <main className={styles.main}>{children}</main>
      <Footer />
    </div>
  );
}
