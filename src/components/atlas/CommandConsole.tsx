"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Command,
  FileText,
  HelpCircle,
  History,
  LockKeyhole,
  Newspaper,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { readAppResult } from "@/lib/api/result";
import { canSetPOTD } from "@/lib/access/potd";
import { isHead } from "@/lib/access/roles";
import { atlasCatalog, type AtlasCatalogItem } from "@/lib/atlas/catalog";
import { parseAtlasQuery } from "@/lib/atlas/query";
import type {
  AtlasPreviewResponse,
  AtlasRelation,
  AtlasResult,
  AtlasResultKind,
  AtlasSearchResponse,
} from "@/lib/atlas/types";
import { useSession } from "@/lib/auth-client";
import { parseRoles } from "@/lib/roles";
import { useThemeStore } from "@/lib/store/theme";
import { useViewModeStore } from "@/lib/store/view-mode";
import styles from "./CommandConsole.module.scss";

type ConsoleContextValue = { open: () => void };
const ConsoleContext = createContext<ConsoleContextValue | null>(null);
const RECENTS_KEY = "ccw:atlas:recents";

const KIND_LABELS: Record<AtlasResultKind, string> = {
  route: "Routes",
  command: "Commands",
  module: "Modules",
  post: "Posts",
  event: "Events",
  project: "Projects",
  team: "Team",
  calendar: "Calendar",
  file: "Files",
  notification: "Notifications",
  hackathon: "Hackathons",
  potd: "POTD",
  contest: "Contests",
};

const KIND_ICONS: Partial<Record<AtlasResultKind, typeof Search>> = {
  post: Newspaper,
  event: CalendarDays,
  calendar: CalendarDays,
  file: FileText,
};

const FILTER_EXAMPLES = [
  "type:project",
  'module:"Machine Learning"',
  "tag:Tutorial",
  "status:upcoming",
  "year:2026",
];

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    Boolean(target.closest(".monaco-editor"))
  );
}

function readRecents(): AtlasResult[] {
  try {
    const raw = sessionStorage.getItem(RECENTS_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? (value as AtlasResult[]).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveRecent(item: AtlasResult) {
  const { icon: _icon, ...serializableItem } = item as AtlasCatalogItem;
  void _icon;
  const next = [
    serializableItem,
    ...readRecents().filter(
      (recent) => recent.id !== item.id || recent.kind !== item.kind,
    ),
  ].slice(0, 8);
  sessionStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

export function useCommandConsole() {
  const value = useContext(ConsoleContext);
  if (!value)
    throw new Error("useCommandConsole must be used within its provider.");
  return value;
}

export function CommandConsoleProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, toggleTheme } = useThemeStore();
  const { toggleViewMode } = useViewModeStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<AtlasResult[]>([]);
  const [failures, setFailures] = useState<AtlasResultKind[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [relations, setRelations] = useState<AtlasRelation[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [recents, setRecents] = useState<AtlasResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const consoleRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const user = session?.user as
    | { access?: string; roles?: unknown }
    | undefined;
  const catalog = useMemo(
    () =>
      atlasCatalog({
        signedIn: Boolean(session),
        head: isHead(user?.access),
        canSetPotd: canSetPOTD(user?.access, parseRoles(user?.roles)),
        theme,
      }),
    [session, theme, user?.access, user?.roles],
  );

  const show = useCallback(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
    setQuery("");
    setRemote([]);
    setRelations([]);
    setActive(0);
    setRecents(readRecents());
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const clearRecents = useCallback(() => {
    sessionStorage.removeItem(RECENTS_KEY);
    setRecents([]);
  }, []);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (isEditable(event.target)) return;
        event.preventDefault();
        if (open) close();
        else show();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [close, open, show]);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => inputRef.current?.focus());
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !consoleRef.current) return;
      const focusable = Array.from(
        consoleRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handleDialogKeys);
    };
  }, [close, open]);

  const parsed = useMemo(
    () => parseAtlasQuery(query.replace(/^[>/]\s*/, "")),
    [query],
  );
  const catalogResults = useMemo(() => {
    const needle = parsed.text.toLowerCase();
    const mode = query.startsWith(">")
      ? "command"
      : query.startsWith("/")
        ? "route"
        : null;
    return catalog
      .filter((item) => !mode || item.kind === mode)
      .filter(
        (item) =>
          parsed.filters.kinds.length === 0 ||
          parsed.filters.kinds.includes(item.kind),
      )
      .filter((item) => {
        if (parsed.filters.module)
          return item.kind === "module" && item.title === parsed.filters.module;
        return (
          !needle ||
          item.title.toLowerCase().includes(needle) ||
          item.description.toLowerCase().includes(needle)
        );
      })
      .map((item) => ({
        ...item,
        score: item.title.toLowerCase().startsWith(needle) ? 95 : item.score,
      }));
  }, [catalog, parsed, query]);

  useEffect(() => {
    const hasFilter = Boolean(
      parsed.filters.kinds.length ||
      parsed.filters.module ||
      parsed.filters.tag ||
      parsed.filters.status ||
      parsed.filters.author ||
      parsed.filters.year ||
      parsed.filters.before ||
      parsed.filters.after,
    );
    const searchable = parsed.text.length >= 2 || hasFilter;
    if (
      !open ||
      !searchable ||
      query.startsWith(">") ||
      query.startsWith("/") ||
      query.startsWith("?")
    ) {
      setRemote([]);
      setFailures([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/atlas/search?q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
          },
        );
        const result = await readAppResult<AtlasSearchResponse>(response);
        if (result.ok) {
          setRemote(result.data.items);
          setFailures(result.data.partialFailures);
        } else {
          setRemote([]);
          setFailures([]);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRemote([]);
          setFailures([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, parsed, query]);

  const results = useMemo(() => {
    if (!query.trim())
      return recents.length ? recents : catalogResults.slice(0, 10);
    if (query.startsWith("?")) return [];
    const combined = [...catalogResults, ...remote];
    const seen = new Set<string>();
    return combined
      .filter((item) => {
        const key = `${item.kind}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }, [catalogResults, query, recents, remote]);

  const selected = results[Math.min(active, Math.max(0, results.length - 1))];
  const singlePane =
    !query.trim() ||
    query.startsWith("?") ||
    !selected ||
    selected?.kind === "route" ||
    selected?.kind === "command";
  const compact =
    query.startsWith("?") ||
    query.startsWith(">") ||
    query.startsWith("/") ||
    !selected;

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    setRelations([]);
    if (!open || !selected || ["route", "command"].includes(selected.kind))
      return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        if (selected.kind === "module") {
          const response = await fetch(
            `/api/atlas/search?q=${encodeURIComponent(`module:"${selected.title}"`)}`,
            { signal: controller.signal },
          );
          const result = await readAppResult<AtlasSearchResponse>(response);
          if (result.ok)
            setRelations(
              result.data.items.slice(0, 6).flatMap((item) =>
                item.href
                  ? [
                      {
                        id: item.id,
                        kind: item.kind,
                        title: item.title,
                        href: item.href,
                        basis: `Activity from ${selected.title}`,
                        inferred: true,
                      },
                    ]
                  : [],
              ),
            );
          return;
        }
        const params = new URLSearchParams({
          id: selected.id,
          kind: selected.kind,
          title: selected.title,
        });
        if (selected.module) params.set("module", selected.module);
        if (selected.tags?.length) params.set("tags", selected.tags.join(","));
        if (selected.date) params.set("date", selected.date);
        const response = await fetch(`/api/atlas/preview?${params}`, {
          signal: controller.signal,
        });
        const result = await readAppResult<AtlasPreviewResponse>(response);
        if (result.ok) setRelations(result.data.relations);
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, selected]);

  const activate = useCallback(
    (item: AtlasResult, newTab = false) => {
      saveRecent(item);
      if (item.kind === "module") {
        setQuery(`module:"${item.title}" `);
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      const command = item.actions?.find((action) => action.command)?.command;
      if (command === "toggle-theme") toggleTheme();
      else if (command === "toggle-view") toggleViewMode();
      else {
        const href =
          item.href ?? item.actions?.find((action) => action.href)?.href;
        if (!href) return;
        if (newTab || /^https?:\/\//.test(href))
          window.open(href, "_blank", "noopener,noreferrer");
        else router.push(href);
      }
      close();
    },
    [close, router, toggleTheme, toggleViewMode],
  );

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(value + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, results.length - 1));
    } else if (event.key === "Enter" && selected) {
      event.preventDefault();
      activate(selected, event.metaKey || event.ctrlKey);
    } else if (
      event.key === "Backspace" &&
      /\s$/.test(query) &&
      /(?:^|\s)(?:type|module|tag|status|author|year|before|after):/.test(query)
    ) {
      event.preventDefault();
      setQuery(
        query
          .trimEnd()
          .replace(
            /(?:^|\s)(?:type|module|tag|status|author|year|before|after):(?:"[^"]*"|'[^']*'|\S+)\s*$/,
            "",
          )
          .trimStart(),
      );
    }
  }

  const context = useMemo(() => ({ open: show }), [show]);
  return (
    <ConsoleContext.Provider value={context}>
      {children}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.backdrop} onMouseDown={close}>
              <section
                ref={consoleRef}
                className={`${styles.console} ${singlePane ? styles.singlePaneConsole : ""} ${compact ? styles.compactConsole : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Club Atlas"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className={styles.searchBar}>
                  <Search aria-hidden="true" size={19} />
                  <input
                    ref={inputRef}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="atlas-results"
                    aria-activedescendant={
                      selected
                        ? `atlas-${selected.kind}-${selected.id}`
                        : undefined
                    }
                    value={query}
                    onChange={(event) =>
                      setQuery(event.target.value.slice(0, 100))
                    }
                    onKeyDown={onKeyDown}
                    placeholder="Search CCW, or type ? for help"
                  />
                  {loading && (
                    <span className={styles.loading} aria-live="polite">
                      Searching…
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close Club Atlas"
                  >
                    <X size={18} />
                  </button>
                </div>
                {parsed.filters.kinds.length > 0 ||
                parsed.filters.module ||
                parsed.filters.tag ||
                parsed.filters.status ||
                parsed.filters.author ||
                parsed.filters.year ||
                parsed.filters.before ||
                parsed.filters.after ? (
                  <div
                    className={styles.activeFilters}
                    aria-label="Active search filters"
                  >
                    {parsed.filters.kinds.map((kind) => (
                      <span key={kind}>type:{kind}</span>
                    ))}
                    {parsed.filters.module && (
                      <span>module:{parsed.filters.module}</span>
                    )}
                    {parsed.filters.tag && (
                      <span>tag:{parsed.filters.tag}</span>
                    )}
                    {parsed.filters.status && (
                      <span>status:{parsed.filters.status}</span>
                    )}
                    {parsed.filters.author && (
                      <span>author:{parsed.filters.author}</span>
                    )}
                    {parsed.filters.year && (
                      <span>year:{parsed.filters.year}</span>
                    )}
                    {parsed.filters.before && (
                      <span>
                        before:
                        {parsed.filters.before.toISOString().slice(0, 10)}
                      </span>
                    )}
                    {parsed.filters.after && (
                      <span>
                        after:{parsed.filters.after.toISOString().slice(0, 10)}
                      </span>
                    )}
                  </div>
                ) : null}
                <div
                  className={`${styles.body} ${singlePane ? styles.singlePane : ""}`}
                >
                  <div
                    className={styles.results}
                    id="atlas-results"
                    role="listbox"
                    aria-label="Atlas results"
                  >
                    {!query.trim() && recents.length > 0 && (
                      <div
                        className={`${styles.groupLabel} ${styles.recentsHeader}`}
                      >
                        <span>
                          <History aria-hidden="true" size={13} /> Recent
                        </span>
                        <button
                          type="button"
                          onClick={clearRecents}
                          aria-label="Clear recent Atlas items"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    {query.startsWith("?") ? (
                      <Help query={query.slice(1)} setQuery={setQuery} />
                    ) : results.length ? (
                      results.map((item, index) => {
                        const catalogItem = catalog.find(
                          (candidate) =>
                            candidate.id === item.id &&
                            candidate.kind === item.kind,
                        );
                        const Icon =
                          catalogItem?.icon ??
                          KIND_ICONS[item.kind] ??
                          Sparkles;
                        return (
                          <Fragment key={`${item.kind}:${item.id}`}>
                            {(index === 0 ||
                              results[index - 1].kind !== item.kind) && (
                              <p className={styles.groupLabel}>
                                {KIND_LABELS[item.kind]}
                              </p>
                            )}
                            <button
                              id={`atlas-${item.kind}-${item.id}`}
                              type="button"
                              role="option"
                              aria-selected={index === active}
                              className={
                                index === active
                                  ? styles.activeResult
                                  : styles.result
                              }
                              onMouseEnter={() => setActive(index)}
                              onClick={() => activate(item)}
                            >
                              <Icon aria-hidden="true" size={17} />
                              <span>
                                <strong>{item.title}</strong>
                                <small>{item.matchReason}</small>
                              </span>
                              {item.internal && (
                                <LockKeyhole aria-label="Internal" size={13} />
                              )}
                            </button>
                          </Fragment>
                        );
                      })
                    ) : loading ? (
                      <p className={styles.empty}>Searching club records…</p>
                    ) : (
                      <p className={styles.empty}>
                        No permitted results match this search.
                      </p>
                    )}
                    {failures.length > 0 && (
                      <p className={styles.partial} role="status">
                        Some result groups could not be loaded:{" "}
                        {failures.map((kind) => KIND_LABELS[kind]).join(", ")}.
                      </p>
                    )}
                  </div>
                  <aside
                    className={`${styles.preview} ${singlePane ? styles.mobileHidden : ""}`}
                    aria-live="polite"
                  >
                    {selected ? (
                      <>
                        <div className={styles.previewHeading}>
                          <span>{KIND_LABELS[selected.kind]}</span>
                          {selected.internal && (
                            <span className={styles.internalBadge}>
                              <LockKeyhole size={12} /> Internal
                            </span>
                          )}
                        </div>
                        <h2>{selected.title}</h2>
                        <p>{selected.description}</p>
                        <div className={styles.meta}>
                          {selected.module && <span>{selected.module}</span>}
                          {selected.status && <span>{selected.status}</span>}
                          {selected.date && (
                            <span>
                              {new Date(selected.date).toLocaleDateString(
                                "en-IN",
                                { dateStyle: "medium" },
                              )}
                            </span>
                          )}
                        </div>
                        {selected.tags?.length ? (
                          <div className={styles.tags}>
                            {selected.tags.slice(0, 5).map((tag) => (
                              <span key={tag}>{tag}</span>
                            ))}
                          </div>
                        ) : null}
                        {(selected.href || selected.actions?.length) && (
                          <div className={styles.previewActions}>
                            {selected.actions
                              ?.filter((action) => action.href)
                              .map((action) => (
                                <a
                                  key={`${action.label}:${action.href}`}
                                  className={styles.openAction}
                                  href={action.href}
                                  target={
                                    action.external ? "_blank" : undefined
                                  }
                                  rel={
                                    action.external ? "noreferrer" : undefined
                                  }
                                >
                                  {action.label} <ArrowRight size={15} />
                                </a>
                              ))}
                            {!selected.actions?.some(
                              (action) => action.href,
                            ) && (
                              <button
                                className={styles.openAction}
                                type="button"
                                onClick={() => activate(selected)}
                              >
                                Open <ArrowRight size={15} />
                              </button>
                            )}
                          </div>
                        )}
                        <div className={styles.relations}>
                          <h3>
                            {selected.kind === "module"
                              ? "Module activity"
                              : "Related trail"}
                          </h3>
                          {previewLoading ? (
                            <p>Tracing related records…</p>
                          ) : relations.length ? (
                            relations.map((relation) => (
                              <a
                                key={`${relation.kind}:${relation.id}`}
                                href={relation.href}
                              >
                                <span>{relation.title}</span>
                                <small>
                                  {relation.basis}
                                  {relation.inferred ? " · inferred" : ""}
                                </small>
                              </a>
                            ))
                          ) : (
                            <p>
                              No explainable links found in current records.
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className={styles.previewEmpty}>
                        <Command size={26} />
                        <p>
                          Select a result to inspect why it matched and trace
                          related club activity.
                        </p>
                      </div>
                    )}
                  </aside>
                </div>
                <footer className={styles.footer}>
                  <span>↑↓ Navigate</span>
                  <span>↵ Open</span>
                  <span>⌘/Ctrl ↵ New tab</span>
                  <span>Esc Close</span>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </ConsoleContext.Provider>
  );
}

function Help({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (value: string) => void;
}) {
  const needle = query.trim().toLowerCase();
  const examples = FILTER_EXAMPLES.filter((item) =>
    item.toLowerCase().includes(needle),
  );
  return (
    <div className={styles.help}>
      <h2>
        <HelpCircle aria-hidden="true" size={20} /> Search help
      </h2>
      <p className={styles.helpIntro}>
        Use plain words, quoted phrases, or combine filters. Type{" "}
        <code>&gt;</code> for commands and <code>/</code> for routes.
      </p>
      <div className={styles.examples}>
        {examples.map((example) => (
          <button key={example} type="button" onClick={() => setQuery(example)}>
            {example}
          </button>
        ))}
      </div>
      <div className={styles.helpNote}>
        <LockKeyhole aria-hidden="true" size={15} />
        <p>
          Results marked Internal are visible because your account is
          authorized.
        </p>
      </div>
    </div>
  );
}
