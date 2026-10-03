"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
  type ReactNode,
} from "react";
import { Copy } from "lucide-react";
import { executeCode } from "@/lib/codeRunner/executor";
import CodeEditor from "./CodeEditor";
import LanguageSelector from "./LanguageSelector";
import TestCasePanel from "./TestCasePanel";
import ProblemStatement, { type ProblemContent } from "./ProblemStatement";
import {
  RunnerDraftStore,
  type DraftIdentity,
  type RunnerDraft,
} from "./drafts";
import {
  executionKey,
  runTestBatch,
  type ExecutionSnapshot,
  type TestBatch,
} from "./execution";
import styles from "./Workspace.module.scss";

export type WorkspaceTab = { id: string; label: string; content: ReactNode };
export type CodeRunnerWorkspaceHandle = { flush: () => void };
export type CodeRunnerWorkspaceProps = {
  ref?: Ref<CodeRunnerWorkspaceHandle>;
  identity: DraftIdentity;
  content?: ProblemContent | null;
  header?: ReactNode;
  actions?: ReactNode;
  notice?: ReactNode;
  extraTabs?: WorkspaceTab[];
  onTabChange?: (id: string) => void;
  readOnly?: boolean;
  visible?: boolean;
};

/** Owns code persistence and execution */
export default function CodeRunnerWorkspace({
  ref,
  ...props
}: CodeRunnerWorkspaceProps) {
  const [storageFailed, setStorageFailed] = useState(false);
  const [store] = useState(
    () =>
      new RunnerDraftStore(
        () => window.localStorage,
        () => setStorageFailed(true),
      ),
  );
  useImperativeHandle(ref, () => ({ flush: store.flush }), [store]);
  const [batches, setBatches] = useState<Record<string, TestBatch>>({});
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const runtimes = useRef(new Set<string>());

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") store.flush();
    };
    window.addEventListener("pagehide", store.flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      store.flush();
      window.removeEventListener("pagehide", store.flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [store]);
  useEffect(() => {
    store.flush();
  }, [store, props.identity.stateKey, props.visible]);

  const run = async (snapshot: ExecutionSnapshot) => {
    if (running.current || !snapshot.testCases.length) return;
    running.current = true;
    setBusy(true);
    // Capture all inputs before awaiting the runtime
    const captured = {
      ...snapshot,
      testCases: snapshot.testCases.map((test) => ({ ...test })),
    };
    const key = `${captured.draftId}:${captured.language}`;
    const batch: TestBatch = {
      snapshot: captured,
      phase: runtimes.current.has(captured.language)
        ? "running"
        : "downloading",
      results: [],
    };
    setBatches((previous) => ({ ...previous, [key]: batch }));
    try {
      const results = await runTestBatch(captured, executeCode, () => {
        runtimes.current.add(captured.language);
        setBatches((previous) => ({
          ...previous,
          [key]: { ...batch, phase: "running" },
        }));
      });
      setBatches((previous) => ({
        ...previous,
        [key]: { ...batch, phase: null, results },
      }));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <div className={styles.workspace}>
      {props.header && <div className={styles.header}>{props.header}</div>}
      {props.notice}
      {storageFailed && (
        <p className={styles.notice} role="status">
          Browser saving is unavailable or a saved draft could not be read. Copy
          your code before reloading or leaving this page.
        </p>
      )}
      <DraftWorkspace
        key={`${props.identity.stateKey}:${!!props.readOnly}`}
        {...props}
        store={store}
        batches={batches}
        busy={busy}
        onRun={run}
      />
    </div>
  );
}

function DraftWorkspace({
  identity,
  content,
  actions,
  extraTabs = [],
  onTabChange,
  readOnly,
  store,
  batches,
  busy,
  onRun,
}: CodeRunnerWorkspaceProps & {
  store: RunnerDraftStore;
  batches: Record<string, TestBatch>;
  busy: boolean;
  onRun: (snapshot: ExecutionSnapshot) => void;
}) {
  const [draft, setDraft] = useState<RunnerDraft | null>(null);
  const draftRef = useRef<RunnerDraft | null>(null);
  const [tab, setTab] = useState(content ? "problem" : "tests");
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(35);
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const samplesRef = useRef(content?.samples ?? []);
  const identityRef = useRef(identity);

  useEffect(() => {
    if (!readOnly) {
      draftRef.current = store.read(identityRef.current, samplesRef.current);
      setDraft(draftRef.current);
    }
    return () => store.flush();
  }, [store, readOnly]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const update = (patch: Partial<RunnerDraft>) => {
    if (!draftRef.current) return;
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(store.update(identity, next));
  };
  const tabs = [
    ...(content
      ? [
          {
            id: "problem",
            label: "Problem",
            content: <ProblemStatement content={content} />,
          },
        ]
      : []),
    ...(!readOnly
      ? [
          {
            id: "tests",
            label: `Tests (${draft?.testCases.length ?? 0})`,
            content: null,
          },
        ]
      : []),
    ...extraTabs,
  ];
  const selectTab = (next: string) => {
    setTab(next);
  };
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];
  const activeTabId = activeTab?.id;
  useEffect(() => {
    if (activeTabId) onTabChange?.(activeTabId);
  }, [activeTabId, onTabChange]);
  const snapshot = draft && {
    draftId: identity.stateKey,
    language: draft.language,
    source: draft.code[draft.language],
    testCases: draft.testCases,
  };
  const batch = snapshot && batches[`${snapshot.draftId}:${snapshot.language}`];
  const matches =
    batch &&
    snapshot &&
    executionKey(batch.snapshot) === executionKey(snapshot);

  const copy = async () => {
    if (!draft) return;
    const source = draft.code[draft.language];
    try {
      await navigator.clipboard.writeText(source);
    } catch {
      const focused = document.activeElement as HTMLElement | null;
      const textarea = document.createElement("textarea");
      textarea.value = source;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      focused?.focus({ preventScroll: true });
    }
    setCopied(true);
  };

  return (
    <div className={styles.solveContainer} ref={containerRef}>
      {!readOnly && draft && (
        <>
          <div className={styles.leftPanel}>
            <div className={styles.toolbar}>
              <LanguageSelector
                language={draft.language}
                onChange={(language) => {
                  store.flush();
                  update({ language });
                }}
              />
              <div className={styles.toolbarActions}>
                <button className={styles.copyBtn} type="button" onClick={copy}>
                  <Copy size={14} />
                  {copied ? "Copied!" : "Copy Code"}
                </button>
                {actions}
              </div>
            </div>
            <div className={styles.editorArea}>
              <CodeEditor
                language={draft.language}
                value={draft.code[draft.language]}
                onChange={(source) =>
                  update({
                    code: { ...draft.code, [draft.language]: source },
                  })
                }
              />
            </div>
          </div>
          <div
            role="separator"
            aria-label="Resize problem panel"
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={60}
            aria-valuenow={Math.round(width)}
            tabIndex={0}
            className={styles.divider}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowLeft"
                  ? width + 2
                  : event.key === "ArrowRight"
                    ? width - 2
                    : event.key === "Home"
                      ? 20
                      : event.key === "End"
                        ? 60
                        : null;
              if (next !== null) {
                event.preventDefault();
                setWidth(Math.min(60, Math.max(20, next)));
              }
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              event.currentTarget.focus();
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              const rect = containerRef.current?.getBoundingClientRect();
              if (rect)
                setWidth(
                  Math.min(
                    60,
                    Math.max(
                      20,
                      ((rect.right - event.clientX) / rect.width) * 100,
                    ),
                  ),
                );
            }}
            onPointerUp={(event) =>
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          />
        </>
      )}
      <div
        className={readOnly ? styles.readOnlyPanel : styles.rightPanel}
        style={readOnly ? undefined : { flexBasis: `${width}%` }}
      >
        <div
          className={styles.panelTabs}
          role="tablist"
          aria-label="Runner panels"
        >
          {tabs.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${id}-${item.id}`}
              aria-controls={`${id}-panel`}
              aria-selected={activeTab?.id === item.id}
              tabIndex={activeTab?.id === item.id ? 0 : -1}
              className={
                activeTab?.id === item.id
                  ? styles.panelTabActive
                  : styles.panelTab
              }
              onClick={() => selectTab(item.id)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  selectTab(tabs[next].id);
                  document.getElementById(`${id}-${tabs[next].id}`)?.focus();
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-${activeTab?.id}`}
          className={styles.tabContent}
        >
          {activeTab?.id === "tests" && draft && snapshot ? (
            <>
              {batch && !matches && (
                <p role="status">
                  Code or tests changed. Run again to test this draft.
                </p>
              )}
              {busy && !matches && (
                <p role="status">Tests are running for another draft.</p>
              )}
              <TestCasePanel
                testCases={draft.testCases}
                onTestCasesChange={(testCases) => update({ testCases })}
                activeTestCaseId={draft.activeTestCaseId}
                onSelectTestCase={(activeTestCaseId) =>
                  update({ activeTestCaseId })
                }
                runPhase={matches ? batch.phase : null}
                results={matches ? batch.results : []}
                busy={busy}
                onRun={() => onRun(snapshot)}
              />
            </>
          ) : (
            activeTab?.content
          )}
        </div>
      </div>
    </div>
  );
}
