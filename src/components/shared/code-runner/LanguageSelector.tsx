"use client";

import type { CodeRunnerLanguage } from "@/lib/constants";
import {
  CODE_RUNNER_LANGUAGES,
  CODE_RUNNER_LANGUAGE_LABELS,
} from "@/lib/constants";

import styles from "./CodeRunner.module.scss";

type Props = {
  language: CodeRunnerLanguage;
  onChange: (language: CodeRunnerLanguage) => void;
};

export default function LanguageSelector({ language, onChange }: Props) {
  return (
    <div className={styles.languageSelector}>
      {CODE_RUNNER_LANGUAGES.map((lang) => (
        <button
          key={lang}
          className={`${styles.langBtn} ${language === lang ? styles.langBtnActive : ""}`}
          onClick={() => onChange(lang)}
          type="button"
        >
          {CODE_RUNNER_LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
