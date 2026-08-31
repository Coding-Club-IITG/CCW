import Link from "next/link";
import {
  IconCCLogo,
  IconGithub,
  IconInstagram,
  IconLinkedIn,
} from "@/components/shared/Icons";
import { Mail as IconMail } from "lucide-react";
import { CLUB_EMAIL, IITG_ADDRESS, SOCIAL_PROFILES } from "@/lib/seo";
import styles from "./Footer.module.scss";

const EXPLORE = [
  { href: "/blog", label: "Blog" },
  { href: "/events", label: "Events" },
  { href: "/projects", label: "Projects" },
  { href: "/team", label: "Team" },
];

const [GITHUB_URL, INSTAGRAM_URL, LINKEDIN_URL] = SOCIAL_PROFILES;

const ELSEWHERE = [
  { href: GITHUB_URL, label: "GitHub", Icon: IconGithub },
  { href: INSTAGRAM_URL, label: "Instagram", Icon: IconInstagram },
  { href: LINKEDIN_URL, label: "LinkedIn", Icon: IconLinkedIn },
  { href: `mailto:${CLUB_EMAIL}`, label: "Email", Icon: IconMail },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.top}>
        <div className={styles.identity}>
          <div className={styles.lockup}>
            <IconCCLogo width={17} height={23} aria-hidden="true" />
            <span>Coding Club</span>
          </div>
          <address className={styles.address}>
            {IITG_ADDRESS.streetAddress}, {IITG_ADDRESS.addressRegion} -{" "}
            {IITG_ADDRESS.postalCode}, India
          </address>
        </div>

        <nav className={styles.columns} aria-label="Footer">
          <div className={styles.column}>
            <span className={styles.columnLabel}>Explore</span>
            {EXPLORE.map(({ href, label }) => (
              <Link key={href} href={href} className={styles.columnLink}>
                {label}
              </Link>
            ))}
          </div>

          <div className={styles.column}>
            <span className={styles.columnLabel}>Elsewhere</span>
            {ELSEWHERE.map(({ href, label, Icon }) => {
              const external = href.startsWith("http");
              return (
                <Link
                  key={href}
                  href={href}
                  className={styles.columnLink}
                  {...(external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  <Icon width={15} height={15} aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      <div className={styles.bottom}>
        <span>© 2026 Coding Club IITG. All rights reserved.</span>
      </div>
    </footer>
  );
}
