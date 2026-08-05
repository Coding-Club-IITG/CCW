"use client";

import { useSession } from "@/lib/auth-client";
import { canSetPOTD, parseRoles } from "@/lib/roles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import styles from "./PotdLayout.module.scss";
import {
  IconClock,
  IconStar,
  IconFlame,
  IconArchive,
  IconEdit,
} from "@/components/shared/Icons";

// Icons for navigation items
const Icons = {
  Daily: () => <IconClock className={styles.icon} />,
  Leaderboard: () => <IconStar className={styles.icon} />,
  Streak: () => <IconFlame className={styles.icon} />,
  Archive: () => <IconArchive className={styles.icon} />,
  Admin: () => <IconEdit className={styles.icon} />,
};

export default function PotdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const canSet = user ? canSetPOTD(user.access, parseRoles(user.roles)) : false;

  const pathname = usePathname();

  const navItems = [
    {
      href: "/internal/potd",
      label: "Daily Challenge",
      icon: Icons.Daily,
      exact: true,
    },
    {
      href: "/internal/potd/past-problems",
      label: "Past Problems",
      icon: Icons.Archive,
    },
    {
      href: "/internal/potd/leaderboard",
      label: "Points Leaderboard",
      icon: Icons.Leaderboard,
    },
    {
      href: "/internal/potd/streak",
      label: "Streak Leaderboard",
      icon: Icons.Streak,
    },
  ];

  return (
    <div className={styles.layoutContainer}>
      <aside className={styles.sidebar}>
        <ul className={styles.navList}>
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href);

            return (
              <li key={item.href} className={styles.navItem}>
                <Link
                  href={item.href}
                  className={`${styles.navLink} ${isActive ? styles.activeLink : ""}`}
                >
                  <item.icon />
                  {item.label}
                </Link>
              </li>
            );
          })}

          {canSet && (
            <>
              <li className={styles.adminDivider} aria-hidden="true" />
              <li className={styles.navItem}>
                <Link
                  href="/internal/potd/set-problem"
                  className={`${styles.navLink} ${pathname?.startsWith("/internal/potd/set-problem") ? styles.activeLink : ""}`}
                >
                  <Icons.Admin />
                  Set Problem
                </Link>
              </li>
            </>
          )}
        </ul>
      </aside>

      <section className={styles.content}>{children}</section>
    </div>
  );
}
