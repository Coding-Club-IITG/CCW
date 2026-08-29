"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  RefreshCw as IconSwitchView,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { isHead } from "@/lib/access/roles";
import { getUserRoleLabels } from "@/lib/roles";
import { useThemeStore } from "@/lib/store/theme";
import { useViewModeStore } from "@/lib/store/view-mode";
import { getDisplayName } from "@/lib/utils";
import { cleanupPushBeforeLogout } from "@/lib/push/client";
import UserAvatar from "@/components/shared/UserAvatar";
import { useCommandConsole } from "@/components/atlas/CommandConsole";
import CreditsModal from "./CreditsModal";
import NotificationBell from "./NotificationBell";
import styles from "./Navbar.module.scss";
import Modal from "@/components/shared/Modal";
import UserSearch, {
  type UserSearchItem,
} from "@/components/shared/UserSearch";
import { expectAppData } from "@/lib/api/result";
import { useRuntimeConfig } from "@/components/layout/Providers";

async function searchDevelopmentUsers(query: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/dev/users?query=${encodeURIComponent(query)}`,
    { signal },
  );
  return expectAppData<UserSearchItem[]>(response);
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
  { href: "/internal/calendar", label: "Calendar" },
  { href: "/internal/files", label: "Files" },
  { href: "/internal/cp", label: "CP" },
  { href: "/internal/potd", label: "POTD" },
  { href: "/internal/contests", label: "Contests" },
  { href: "/internal/hackathons", label: "Hackathons" },
];

export default function Navbar() {
  const router = useRouter();
  const { data: session, isPending, refetch: refetchSession } = useSession();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [identityPickerOpen, setIdentityPickerOpen] = useState(false);
  const { theme, toggleTheme } = useThemeStore();
  const { viewMode, toggleViewMode, setViewMode } = useViewModeStore();
  const { developmentAuthEnabled } = useRuntimeConfig();
  const commandConsole = useCommandConsole();
  const navbarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (navbarRef.current && !navbarRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setHamburgerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const user = session?.user as
    | {
        name?: string;
        email?: string;
        image?: string | null;
        access?: string;
        managedModules?: unknown;
        roles?: unknown;
        pizza_count?: number;
      }
    | undefined;

  const showInternal = !!session && viewMode === "internal";
  const navLinks = showInternal ? INTERNAL_LINKS : PUBLIC_LINKS;
  const roleLabels = getUserRoleLabels(
    user?.access,
    user?.managedModules,
    user?.roles,
  );

  return (
    <nav className={styles.navbar} ref={navbarRef}>
      <div className={styles.leftSection}>
        <Link
          href={showInternal ? "/internal/dashboard" : "/"}
          className={styles.logo}
          onClick={() => setHamburgerOpen(false)}
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

      <div className={styles.rightSection}>
        <div
          className={`${styles.navLinks} ${hamburgerOpen ? styles.open : ""}`}
        >
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setHamburgerOpen(false)}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className={styles.actionsSection}>
          <button
            className={styles.searchButton}
            onClick={commandConsole.open}
            aria-label="Open Atlas search"
            type="button"
          >
            <Search aria-hidden="true" size={16} />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
          {showInternal && <NotificationBell />}
          {session ? (
            <div className={styles.avatarWrapper} ref={menuRef}>
              <button
                className={styles.avatarButton}
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="User menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                type="button"
              >
                <UserAvatar
                  name={user?.name}
                  image={user?.image}
                  size={32}
                  imageClassName={styles.avatarImg}
                  fallbackClassName={styles.avatarInitials}
                />
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
                      <div
                        className={styles.userMenuRoles}
                        aria-label="Club positions"
                      >
                        {roleLabels.map((label) => (
                          <span className={styles.userMenuRole} key={label}>
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.userMenuDivider} />
                  {showInternal && (
                    <>
                      <Link
                        href="/internal/profile"
                        className={styles.userMenuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          setHamburgerOpen(false);
                        }}
                      >
                        <UserRound aria-hidden="true" size={14} />
                        Profile
                      </Link>
                      {isHead(user?.access) && (
                        <Link
                          href="/admin"
                          className={styles.userMenuItem}
                          onClick={() => {
                            setMenuOpen(false);
                            setHamburgerOpen(false);
                          }}
                        >
                          <ShieldCheck aria-hidden="true" size={14} />
                          Administration
                        </Link>
                      )}
                    </>
                  )}
                  {developmentAuthEnabled && (
                    <button
                      className={styles.userMenuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        setIdentityPickerOpen(true);
                      }}
                    >
                      <Users aria-hidden="true" size={14} />
                      Switch user
                    </button>
                  )}
                  <button
                    className={styles.userMenuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      setHamburgerOpen(false);
                      toggleViewMode();
                    }}
                  >
                    <IconSwitchView width={14} height={14} />
                    {showInternal ? "Public View" : "Internal View"}
                  </button>
                  {showInternal && (
                    <button
                      className={styles.userMenuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        setHamburgerOpen(false);
                        setCreditsOpen(true);
                      }}
                    >
                      <Users aria-hidden="true" size={14} />
                      Credits
                    </button>
                  )}
                  <button
                    className={styles.userMenuLogout}
                    onClick={async () => {
                      setMenuOpen(false);
                      setHamburgerOpen(false);
                      await cleanupPushBeforeLogout();
                      await signOut();
                      router.replace("/");
                      router.refresh();
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
                if (developmentAuthEnabled) {
                  setIdentityPickerOpen(true);
                  return;
                }
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

          <button
            onClick={() => setHamburgerOpen(!hamburgerOpen)}
            className={styles.hamburgerButton}
            aria-label="Toggle navigation menu"
            aria-expanded={hamburgerOpen}
            type="button"
          >
            {hamburgerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {creditsOpen && (
        <CreditsModal
          canEdit={isHead(user?.access)}
          onClose={() => {
            setCreditsOpen(false);
            requestAnimationFrame(() =>
              menuRef.current?.querySelector("button")?.focus(),
            );
          }}
        />
      )}
      {identityPickerOpen && (
        <Modal
          title="Login as…"
          description="Choose an existing development user."
          onClose={() => setIdentityPickerOpen(false)}
          maxWidth={640}
          contentClassName={styles.identityPickerContent}
        >
          <UserSearch
            minLength={0}
            inlineResults
            search={searchDevelopmentUsers}
            placeholder="Search users by name…"
            onSelect={async (selected) => {
              setIsLoggingIn(true);
              if (session) {
                await cleanupPushBeforeLogout();
                await signOut();
              }
              const response = await fetch("/api/auth/dev/sign-in", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: selected.id }),
              });
              await expectAppData(response);
              setViewMode("internal");
              await refetchSession();
              setIdentityPickerOpen(false);
              setIsLoggingIn(false);
              router.replace("/internal/dashboard");
              router.refresh();
            }}
          />
        </Modal>
      )}
    </nav>
  );
}
