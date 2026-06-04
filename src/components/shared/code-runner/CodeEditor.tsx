"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";

import type { CodeRunnerLanguage } from "@/lib/constants";
import { CODE_RUNNER_DEFAULT_CODE } from "@/lib/constants";

import styles from "./CodeRunner.module.scss";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type Props = {
  language: CodeRunnerLanguage;
  value?: string;
  onChange?: (value: string) => void;
};

export default function CodeEditor({ language, value, onChange }: Props) {
  const [mounted, setMounted] = useState(false);

  const handleMount = useCallback<OnMount>((editorInstance, monaco) => {
    setMounted(true);
    const { KeyMod, KeyCode } = monaco;

    // Ctrl+/ - Open command palette
    editorInstance.addAction({
      id: "open-command-palette",
      label: "Open Command Palette",
      keybindings: [KeyMod.CtrlCmd | KeyCode.Slash],
      run: (ed) => {
        ed.trigger("keyboard", "editor.action.quickCommand", null);
      },
    });

    // Ctrl+D - Delete current line
    editorInstance.addAction({
      id: "delete-line",
      label: "Delete Line",
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyD],
      run: (ed) => {
        ed.trigger("keyboard", "editor.action.deleteLines", null);
      },
    });

    // Ctrl+' - Toggle line comment
    editorInstance.addAction({
      id: "add-comment-line",
      label: "Toggle Line Comment",
      keybindings: [KeyMod.CtrlCmd | KeyCode.Quote],
      run: (ed) => {
        ed.trigger("keyboard", "editor.action.commentLine", null);
      },
    });

    // Ctrl+Shift+' - Remove line comment
    editorInstance.addAction({
      id: "remove-comment-line",
      label: "Remove Line Comment",
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Quote],
      run: (ed) => {
        ed.trigger("keyboard", "editor.action.removeCommentLine", null);
      },
    });
  }, []);

  const monacoLanguage = language === "cpp" ? "cpp" : "python";
  const displayValue = value ?? CODE_RUNNER_DEFAULT_CODE[language];

  return (
    <div className={styles.editorWrapper}>
      {!mounted && (
        <div className={styles.editorLoading}>Loading editor...</div>
      )}
      <Editor
        height="100%"
        language={monacoLanguage}
        value={displayValue}
        onChange={(val) => onChange?.(val ?? "")}
        onMount={handleMount}
        theme="vs-dark"
        options={{
          fontSize: 14,
          fontFamily:
            "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          lineNumbers: "on",
          renderLineHighlight: "line",
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          wordWrap: "off",
          suggest: { showKeywords: true },
          fixedOverflowWidgets: true,
        }}
      />
    </div>
  );
}
