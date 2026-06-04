"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

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

  const handleMount = useCallback(() => {
    setMounted(true);
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
