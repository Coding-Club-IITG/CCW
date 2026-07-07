"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { useState, useRef, useEffect } from "react";
import { useThemeStore } from "@/lib/store/theme";
import { useViewModeStore } from "@/lib/store/view-mode";
import { isAdmin } from "@/lib/roles";
import { getDisplayName } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";
import { IconSwitchView } from "@/components/shared/Icons";
import NotificationBell from "./NotificationBell";
import styles from "./Navbar.module.scss";

function UserAvatar({
  name,
  image,
}: {
  name: string | undefined;
  image: string | undefined | null;
}) {
  const initials = (name || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (image) {
    return (
      <Image src={image} alt={name || "User"} className={styles.avatarImg} width={56} height={56} />
    );
  }
  return <span className={styles.avatarInitials}>{initials}</span>;
}

const PUBLIC_LINKS = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/events", label: "Events" },
  { href: "/projects", label: "Projects" },
  { href: "/team", label: "Team" },
];

const INTERNAL_LINKS = [
  { href: "/internal/dashboard", label: "Dashboard" },
  { href: "/internal/files", label: "Files" },
  { href: "/internal/cp", label: "CP" },
  { href: "/internal/potd", label: "POTD" },
  { href: "/internal/contests", label: "Contests" },
  { href: "/internal/hackathons", label: "Hackathons" },
];

export default function Navbar() {
  const { data: session, isPending } = useSession();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useThemeStore();
  const { viewMode, toggleViewMode } = useViewModeStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const user = session?.user as
    | {
        name?: string;
        email?: string;
        image?: string | null;
        role?: string;
        moduleRoles?: any[];
        pizza_count?: number;
      }
    | undefined;

  const showInternal = !!session && viewMode === "internal";
  const navLinks = showInternal ? INTERNAL_LINKS : PUBLIC_LINKS;

  return (
    <nav className={styles.navbar}>
      <div className={styles.leftSection}>
        <Link
          href={showInternal ? "/internal/dashboard" : "/"}
          className={styles.logo}
        >
          CC IITG
        </Link>
        <button
          onClick={toggleTheme}
          className={styles.themeToggle}
          aria-label="Toggle dark mode"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      <div className={styles.navLinks}>
        {navLinks.map(({ href, label }) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
        {showInternal && <NotificationBell />}
        {session ? (
          <div className={styles.avatarWrapper} ref={menuRef}>
            <button
              className={styles.avatarButton}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="User menu"
              type="button"
            >
              <UserAvatar name={user?.name} image={user?.image} />
            </button>
            {menuOpen && (
              <div className={styles.userMenu}>
                <div className={styles.userMenuHeader}>
                  <span className={styles.userMenuName}>
                    {getDisplayName(user?.name || "User", user?.pizza_count)}
                  </span>
                  <span className={styles.userMenuEmail}>
                    {showInternal ? user?.email || "" : "Viewing as public"}
                  </span>
                  {showInternal && (
                    <span className={styles.userMenuRole}>
                      {user?.role || "Member"}
                      {user?.moduleRoles && user.moduleRoles.length > 0 && (
                        <>
                          {" · "}
                          {user.moduleRoles
                            .map(
                              (mr: any) =>
                                mr.module + (mr.role ? ` (${mr.role})` : ""),
                            )
                            .join(", ")}
                        </>
                      )}
                    </span>
                  )}
                </div>
                <div className={styles.userMenuDivider} />
                {showInternal && (
                  <>
                    <Link
                      href="/internal/profile"
                      className={styles.userMenuItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    {isAdmin(user?.role) && (
                      <Link
                        href="/admin"
                        className={styles.userMenuItem}
                        onClick={() => setMenuOpen(false)}
                      >
                        Administration
                      </Link>
                    )}
                  </>
                )}
                <button
                  className={styles.userMenuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    toggleViewMode();
                  }}
                >
                  <IconSwitchView width={14} height={14} />
                  {showInternal ? "Public View" : "Internal View"}
                </button>
                <button
                  className={styles.userMenuLogout}
                  onClick={async () => {
                    setMenuOpen(false);
                    await signOut();
                    window.location.href = "/";
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            disabled={isLoggingIn || isPending}
            onClick={async () => {
              setIsLoggingIn(true);
              await signIn.social({
                provider: "microsoft",
                callbackURL: "/internal/dashboard",
                errorCallbackURL: "/?error=unauthorized",
              });
            }}
            className={styles.authButton}
          >
            {isLoggingIn ? "Redirecting..." : "Login"}
          </button>
        )}
      </div>
    </nav>
  );
}
