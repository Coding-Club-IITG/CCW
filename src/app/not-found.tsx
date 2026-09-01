import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CLUB_EMAIL } from "@/lib/seo";
import Navbar from "@/components/layout/Navbar/Navbar";
import Footer from "@/components/layout/Footer/Footer";
import PrismMark from "@/components/shared/PrismMark";
import styles from "./not-found.module.scss";

const QUICK_LINKS = [
  { href: "/events", label: "Events" },
  { href: "/projects", label: "Projects" },
  { href: "/team", label: "Team" },
];

export default function NotFound() {
  return (
    <div className={styles.shell}>
      <Navbar />
      <main className={styles.stage}>
        <div className={styles.copy}>
          <p className={styles.kicker}>Error 404 · nothing here</p>
          <p className={styles.code}>404</p>
          <h1 className={styles.title}>This page refracted somewhere else.</h1>
          <p className={styles.description}>
            The link is broken or the page has moved.
          </p>

          <div className={styles.actions}>
            <Link href="/" className={styles.primaryAction}>
              <ArrowLeft size={15} aria-hidden="true" />
              Back home
            </Link>
            <Link href="/blog" className={styles.secondaryAction}>
              Read the blog
            </Link>
          </div>

          <nav className={styles.quickLinks} aria-label="Elsewhere on the site">
            {QUICK_LINKS.map(({ href, label }) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
            <a href={`mailto:${CLUB_EMAIL}`}>Report a broken link</a>
          </nav>
        </div>

        <PrismMark />
      </main>
      <Footer />
    </div>
  );
}
