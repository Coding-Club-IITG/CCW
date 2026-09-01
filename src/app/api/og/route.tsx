import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResult } from "@/lib/api/result.server";
import { parseSearchParams } from "@/lib/api/result";
import { SITE_NAME } from "@/lib/seo";
import { IconCCLogo } from "@/components/shared/Icons";

export const revalidate = 86400;

// Keep in sync with global style
const COLOR = {
  background: "#000000", // --background
  text: "#ffffff", // --foreground-strong
  textDim: "rgba(255, 255, 255, 0.6)",
  accent: "#c0e04a", // --primary
};
const FONT = {
  display: "Handjet", // --font-handjet
  body: "Hanken Grotesk", // --font-hanken-grotesk
  mono: "JetBrains Mono", // --font-jetbrains-mono
};
// --spectrum-gradient
const SPECTRUM_GRADIENT =
  "linear-gradient(90deg, #1d23a7, #6e9ffc, #c0e04a, #fd6f43, #ff4e41, #a849ec)";

const WIDTH = 1200;
const HEIGHT = 630;
const PADDING = 80;
const BAR_HEIGHT = 10;
const LONG_TITLE_CHARS = 42;
const TITLE_MAX_WIDTH = 1000;
const TITLE_CHAR_BUDGET = 68;

// IconCCLogo
const LOGO_HEIGHT = 104;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * 48.096) / 64.521);

const FONT_DIR = join(process.cwd(), "src/app/api/og/fonts");
const FONT_FILES = [
  { file: "Handjet-Bold.ttf", name: FONT.display, weight: 700 },
  { file: "HankenGrotesk-Bold.ttf", name: FONT.body, weight: 700 },
  { file: "JetBrainsMono-Regular.ttf", name: FONT.mono, weight: 400 },
  { file: "JetBrainsMono-Medium.ttf", name: FONT.mono, weight: 500 },
] as const;

type LoadedFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 700;
  style: "normal";
};

let fontCache: Promise<LoadedFont[]> | null = null;

function loadFonts(): Promise<LoadedFont[]> {
  fontCache ??= Promise.all(
    FONT_FILES.map(async (font) => {
      const buffer = await readFile(join(FONT_DIR, font.file));
      const data = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
      return { name: font.name, data, weight: font.weight, style: "normal" };
    }),
  );
  return fontCache;
}

function clean(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function boundedTitle(value: string | null) {
  const text = clean(value);
  return Array.from(text || SITE_NAME)
    .slice(0, 120)
    .join("");
}

export function boundedLine(value: string | null | undefined, limit = 80) {
  return Array.from(clean(value)).slice(0, limit).join("");
}

export function titleFontSize(title: string) {
  return title.length > LONG_TITLE_CHARS ? 52 : 66;
}

/** Trim a title to column budget, breaking on a word where possible */
export function fitTitle(title: string) {
  if (title.length <= TITLE_CHAR_BUDGET) return title;
  const cut = title.slice(0, TITLE_CHAR_BUDGET);
  const lastSpace = cut.lastIndexOf(" ");
  const base =
    lastSpace > TITLE_CHAR_BUDGET * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

const querySchema = z.object({
  title: z.string().max(500).optional(),
  kicker: z.string().max(200).optional(),
  meta: z.string().max(200).optional(),
});

export async function GET(request: NextRequest) {
  const query = parseSearchParams(request.nextUrl.searchParams, querySchema);
  if (!query.ok) return jsonResult(query);

  const title = fitTitle(boundedTitle(query.data.title ?? null));
  const kicker = boundedLine(query.data.kicker) || "IIT Guwahati";
  const meta = boundedLine(query.data.meta) || "codingclub.in";
  const fonts = await loadFonts();

  return new ImageResponse(
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: `${PADDING}px ${PADDING}px ${PADDING - BAR_HEIGHT}px`,
        background: COLOR.background,
        fontFamily: FONT.body,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <IconCCLogo width={LOGO_WIDTH} height={LOGO_HEIGHT} fill={COLOR.text} />
        <span
          style={{
            fontFamily: FONT.display,
            fontWeight: 700,
            fontSize: 66,
            lineHeight: 1,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: COLOR.text,
          }}
        >
          Coding Club
        </span>
      </div>

      {/* kicker / title / meta */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 26,
          maxWidth: TITLE_MAX_WIDTH,
        }}
      >
        <div
          style={{
            fontFamily: FONT.mono,
            fontWeight: 500,
            fontSize: 21,
            lineHeight: 1,
            letterSpacing: "0.19em",
            textTransform: "uppercase",
            color: COLOR.accent,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            fontWeight: 700,
            fontSize: titleFontSize(title),
            lineHeight: 1.06,
            letterSpacing: "-0.03em",
            color: COLOR.text,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: FONT.mono,
            fontWeight: 400,
            fontSize: 21,
            lineHeight: 1,
            letterSpacing: "0.04em",
            color: COLOR.textDim,
          }}
        >
          {meta}
        </div>
      </div>

      {/* spectrum bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: WIDTH,
          height: BAR_HEIGHT,
          background: SPECTRUM_GRADIENT,
        }}
      />
    </div>,
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
