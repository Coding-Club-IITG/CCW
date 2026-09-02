"use client";

import { useEffect, useRef, useState } from "react";

import {
  ARTICLE_TEXT_SIZE_STORAGE_KEY,
  calculateReadingProgress,
  findActiveHeading,
  isArticleTextSize,
  type ArticleTextSize,
} from "@/lib/blog/articleReader";
import type { MarkdownHeading } from "@/lib/blog/markdownHeadings";

import MarkdownRenderer from "./MarkdownRenderer";
import styles from "./ArticleReader.module.scss";

interface ArticleReaderProps {
  content: string;
  headings: MarkdownHeading[];
}

const TEXT_SIZES: Array<{ value: ArticleTextSize; label: string }> = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
];

interface OutlineProps {
  headings: MarkdownHeading[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

interface TextSizeControlsProps {
  textSize: ArticleTextSize;
  onChange: (size: ArticleTextSize) => void;
  className?: string;
}

function TextSizeControls({
  textSize,
  onChange,
  className = "",
}: TextSizeControlsProps) {
  return (
    <div className={`${styles.readerTools} ${className}`}>
      <span id="article-text-size-label">Article text</span>
      <div
        className={styles.sizeOptions}
        role="group"
        aria-labelledby="article-text-size-label"
      >
        {TEXT_SIZES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === textSize ? styles.selectedSize : ""}
            aria-pressed={option.value === textSize}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Outline({ headings, activeId, onSelect }: OutlineProps) {
  return (
    <ol className={styles.outlineList}>
      {headings.map((heading) => (
        <li key={heading.id} className={styles[`depth${heading.depth}`]}>
          <a
            href={`#${heading.id}`}
            className={heading.id === activeId ? styles.activeLink : undefined}
            aria-current={heading.id === activeId ? "location" : undefined}
            onClick={() => onSelect(heading.id)}
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

export default function ArticleReader({
  content,
  headings,
}: ArticleReaderProps) {
  const [textSize, setTextSize] = useState<ArticleTextSize>("default");
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(
    headings[0]?.id ?? null,
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const selectedHeadingRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const storedSize = localStorage.getItem(ARTICLE_TEXT_SIZE_STORAGE_KEY);
      if (isArticleTextSize(storedSize)) setTextSize(storedSize);
    } catch {
      // Storage can be unavailable in privacy-restricted browsers
    }
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateReaderState = () => {
      frame = 0;
      const article = contentRef.current;
      if (!article) return;

      const articleRect = article.getBoundingClientRect();
      setProgress(
        calculateReadingProgress({
          scrollY: window.scrollY,
          articleTop: articleRect.top + window.scrollY,
          articleHeight: articleRect.height,
          viewportHeight: window.innerHeight,
          topOffset: 80,
        }),
      );

      const positions = headings.flatMap(({ id }) => {
        const element = document.getElementById(id);
        return element
          ? [{ id, top: element.getBoundingClientRect().top }]
          : [];
      });
      const selectedHeading = selectedHeadingRef.current;
      const selectedHeadingExists = positions.some(
        ({ id }) => id === selectedHeading,
      );
      setActiveId(
        selectedHeading && selectedHeadingExists
          ? selectedHeading
          : findActiveHeading(positions, 140),
      );
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateReaderState);
    };
    const resumeAutomaticTracking = () => {
      selectedHeadingRef.current = null;
      scheduleUpdate();
    };
    const resumeAutomaticTrackingFromKey = (event: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      ) {
        resumeAutomaticTracking();
      }
    };

    updateReaderState();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("wheel", resumeAutomaticTracking, {
      passive: true,
    });
    window.addEventListener("touchstart", resumeAutomaticTracking, {
      passive: true,
    });
    window.addEventListener("pointerdown", resumeAutomaticTracking, {
      passive: true,
    });
    window.addEventListener("keydown", resumeAutomaticTrackingFromKey);
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    if (contentRef.current) resizeObserver.observe(contentRef.current);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("wheel", resumeAutomaticTracking);
      window.removeEventListener("touchstart", resumeAutomaticTracking);
      window.removeEventListener("pointerdown", resumeAutomaticTracking);
      window.removeEventListener("keydown", resumeAutomaticTrackingFromKey);
      resizeObserver.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [headings, textSize]);

  const updateTextSize = (size: ArticleTextSize) => {
    setTextSize(size);
    try {
      localStorage.setItem(ARTICLE_TEXT_SIZE_STORAGE_KEY, size);
    } catch {
      // The selected size still applies for the current page view.
    }
  };

  const selectHeading = (id: string) => {
    selectedHeadingRef.current = id;
    setActiveId(id);
  };

  return (
    <section className={styles.reader} aria-label="Article reader">
      <div className={styles.progressTrack} aria-hidden="true">
        <div
          className={styles.progressValue}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <progress
        className={styles.srOnly}
        value={progress}
        max={1}
        aria-label="Reading progress"
      />

      {headings.length === 0 && (
        <TextSizeControls
          textSize={textSize}
          onChange={updateTextSize}
          className={styles.standaloneTools}
        />
      )}

      <div
        className={`${styles.readerLayout} ${headings.length === 0 ? styles.withoutOutline : ""}`}
      >
        <div ref={contentRef} className={styles[`text${textSize}`]}>
          <MarkdownRenderer
            content={content}
            enableHeadingAnchors
            enableCodeCopy
          />
        </div>
        {headings.length > 0 && (
          <aside className={styles.outlineColumn}>
            <div className={styles.outlinePanel}>
              <TextSizeControls textSize={textSize} onChange={updateTextSize} />
              <nav
                className={styles.desktopNavigation}
                aria-label="Table of contents"
              >
                <p className={styles.outlineTitle}>On this page</p>
                <Outline
                  headings={headings}
                  activeId={activeId}
                  onSelect={selectHeading}
                />
              </nav>
              <details className={styles.mobileOutline}>
                <summary>On this page</summary>
                <nav aria-label="Table of contents">
                  <Outline
                    headings={headings}
                    activeId={activeId}
                    onSelect={selectHeading}
                  />
                </nav>
              </details>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
