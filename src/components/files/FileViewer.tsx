"use client";

import { expectAppData } from "@/lib/api/result";

import { useEffect, useRef, useState } from "react";
import { FileIcon, AlertCircle } from "lucide-react";
import CompatibleImage from "@/components/shared/CompatibleImage";
import Modal from "@/components/shared/Modal";
import type { FileEntry } from "./types";
import { formatBytes } from "./utils";
import styles from "./FilesClient.module.scss";

// PDF.js loader
// Loaded once on demand from cdnjs, promise is cached so re-opens are instant

const PDFJS_VERSION = "3.11.174";
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

let pdfJsPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  if (pdfJsPromise) return pdfJsPromise;
  pdfJsPromise = new Promise<any>((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement("script");
    script.src = `${PDFJS_CDN}/pdf.min.js`;
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
      resolve(lib);
    };
    script.onerror = () => {
      pdfJsPromise = null;
      reject(new Error("Failed to load PDF.js from CDN."));
    };
    document.head.appendChild(script);
  });
  return pdfJsPromise;
}

// Canvas-based PDF renderer

function PdfCanvasViewer({ blob }: { blob: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await loadPdfJs();
        const arrayBuffer = await blob.arrayBuffer();
        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);

          const containerWidth = container.clientWidth - 32;
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(containerWidth / baseViewport.width, 2);
          const viewport = page.getViewport({ scale });

          const ratio = window.devicePixelRatio || 1;
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width * ratio;
          canvas.height = viewport.height * ratio;
          canvas.style.cssText = [
            `width:${viewport.width}px`,
            `height:${viewport.height}px`,
            "display:block",
            "margin:0 auto 12px",
            "box-shadow:0 1px 6px rgba(0,0,0,0.35)",
            "border-radius:2px",
            // Prevent "Save image as…" from the canvas context menu
            "-webkit-touch-callout:none",
          ].join(";");

          container.appendChild(canvas);

          const ctx = canvas.getContext("2d")!;
          ctx.scale(ratio, ratio);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        if (!cancelled) setStatus("done");
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message ?? "Failed to render PDF.");
          setStatus("error");
        }
      }
    }

    render();

    return () => {
      cancelled = true;
      while (container.firstChild) container.removeChild(container.firstChild);
    };
  }, [blob]);

  if (status === "error") {
    return (
      <div className={styles.viewerNoPreview}>
        <AlertCircle size={40} />
        <p>Could not render this PDF.</p>
        <p className={styles.subtle}>{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className={styles.pdfScrollArea}>
      {status === "loading" && (
        <div className={styles.viewerLoading}>Rendering PDF…</div>
      )}
      {/* onContextMenu here blocks "Save image as…" on every canvas child */}
      <div
        ref={containerRef}
        className={styles.pdfCanvasContainer}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

// File Viewer Modal
// Fetches the file as a Blob (auth cookies sent by fetch automatically), then
// renders it using the right viewer for the MIME type

interface Props {
  file: FileEntry;
  onClose: () => void;
}

export default function FileViewer({ file, onClose }: Props) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  const isPdf = file.mimeType === "application/pdf";
  const isImage = file.mimeType.startsWith("image/");
  const isText = file.mimeType.startsWith("text/");
  const isAudio = file.mimeType.startsWith("audio/");
  const isVideo =
    file.mimeType === "video/mp4" || file.mimeType === "video/webm";
  const canPreview = isPdf || isImage || isText || isAudio || isVideo;

  useEffect(() => {
    let revoked = false;
    let createdUrl: string | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/files/${file._id}`);
        if (!res.ok) {
          const data = await expectAppData<{ error?: string }>(res).catch(
            (error: unknown) => ({
              error: error instanceof Error ? error.message : undefined,
            }),
          );
          if (!revoked) setLoadError(data.error ?? "Failed to load file.");
          return;
        }
        const fetched = await res.blob();
        const typed = new Blob([fetched], { type: file.mimeType });

        if (!revoked) {
          if (!isPdf) {
            createdUrl = URL.createObjectURL(typed);
            setObjectUrl(createdUrl);
          }
          setBlob(typed);
        }
      } catch {
        if (!revoked) setLoadError("Network error - could not load file.");
      } finally {
        if (!revoked) setFetching(false);
      }
    }

    load();

    return () => {
      revoked = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file._id, file.mimeType, isPdf]);

  function renderContent() {
    if (fetching) {
      return <div className={styles.viewerLoading}>Loading…</div>;
    }
    if (loadError) {
      return (
        <div className={styles.viewerNoPreview}>
          <AlertCircle size={40} />
          <p>{loadError}</p>
        </div>
      );
    }
    if (!canPreview || !blob) {
      return (
        <div className={styles.viewerNoPreview}>
          <FileIcon size={48} />
          <p>Preview is not available for this file type.</p>
          <p className={styles.subtle}>
            {file.originalName} &middot; {formatBytes(file.size)}
          </p>
          <p className={styles.viewerNoPreviewHint}>
            This file is view-only and cannot be downloaded.
          </p>
        </div>
      );
    }

    // PDFs: canvas-rendered via PDF.js
    if (isPdf) {
      return <PdfCanvasViewer blob={blob} />;
    }

    // Object URLs are rendered unoptimized by CompatibleImage.
    if (isImage && objectUrl) {
      return (
        <div className={styles.viewerImageWrap}>
          <CompatibleImage
            src={objectUrl}
            alt={file.title}
            className={styles.viewerImage}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            width={1600}
            height={1200}
          />
        </div>
      );
    }

    // Audio: native player
    if (isAudio && objectUrl) {
      return (
        <div className={styles.viewerAudioWrap}>
          <audio controls src={objectUrl} className={styles.viewerAudio} />
        </div>
      );
    }

    // Video: native player
    if (isVideo && objectUrl) {
      return <video controls src={objectUrl} className={styles.viewerFrame} />;
    }

    // Plain text - blob URL iframe
    if (isText && objectUrl) {
      return (
        <iframe
          src={objectUrl}
          className={styles.viewerFrame}
          title={file.title}
          sandbox="allow-same-origin"
        />
      );
    }

    return null;
  }

  return (
    <Modal
      kicker="Files"
      title={file.title}
      description={file.originalName}
      onClose={onClose}
      maxWidth={900}
      className={styles.viewerModal}
      contentClassName={styles.viewerContent}
    >
      {/* Catch-all for right click menu */}
      <div
        className={styles.viewerBody}
        onContextMenu={(e) => e.preventDefault()}
      >
        {renderContent()}
      </div>
    </Modal>
  );
}
