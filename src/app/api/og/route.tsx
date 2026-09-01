import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResult } from "@/lib/api/result.server";
import { parseSearchParams } from "@/lib/api/result";
import { SITE_NAME } from "@/lib/seo";

export const revalidate = 86400;

const WIDTH = 1200;
const HEIGHT = 630;
const LONG_TITLE_CHARS = 40;
const TITLE_COLUMN = 620;
const TITLE_CHAR_BUDGET = 62;
const FONT_DIR = join(process.cwd(), "src/app/api/og/fonts");
const FONT_FILES = [
  { file: "Handjet-Bold.ttf", name: "Handjet", weight: 700 },
  { file: "HankenGrotesk-Bold.ttf", name: "Hanken Grotesk", weight: 700 },
  { file: "JetBrainsMono-Regular.ttf", name: "JetBrains Mono", weight: 400 },
  { file: "JetBrainsMono-Medium.ttf", name: "JetBrains Mono", weight: 500 },
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
  return title.length > LONG_TITLE_CHARS ? 60 : 74;
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

// Prism spectrum lobes
// Satori supports neither conic-gradient nor mask-image
const LOBES = [
  "radial-gradient(circle at 50% 50%, rgba(29,35,167,.9) 0%, rgba(29,35,167,.34) 30%, rgba(29,35,167,0) 58%)",
  "radial-gradient(circle at 66% 30%, rgba(110,159,252,.95) 0%, rgba(110,159,252,.3) 20%, rgba(110,159,252,0) 40%)",
  "radial-gradient(circle at 36% 26%, rgba(192,224,74,.9) 0%, rgba(192,224,74,.26) 18%, rgba(192,224,74,0) 36%)",
  "radial-gradient(circle at 34% 74%, rgba(223,255,107,.72) 0%, rgba(223,255,107,.2) 17%, rgba(223,255,107,0) 34%)",
  "radial-gradient(circle at 64% 68%, rgba(168,73,236,.95) 0%, rgba(168,73,236,.3) 20%, rgba(168,73,236,0) 42%)",
  "radial-gradient(circle at 50% 50%, rgba(255,42,27,1) 0%, rgba(255,42,27,.62) 6%, rgba(241,32,231,.4) 16%, rgba(241,32,231,0) 34%)",
];

const RAYS = [
  {
    top: 265,
    height: 5,
    rotate: -4.2,
    background:
      "linear-gradient(90deg, rgba(255,78,65,0) 34%, rgba(255,78,65,.5) 64%, #FF4E41 90%, rgba(255,78,65,.4) 100%)",
  },
  {
    top: 378,
    height: 11,
    rotate: 8.5,
    background:
      "linear-gradient(90deg, rgba(192,224,74,0) 30%, rgba(192,224,74,.5) 62%, #C0E04A 90%, rgba(192,224,74,0) 100%)",
  },
  {
    top: 479,
    height: 6,
    rotate: -12.5,
    background:
      "linear-gradient(90deg, rgba(59,68,216,0) 32%, rgba(59,68,216,.55) 64%, #3B44D8 92%, rgba(59,68,216,.4) 100%)",
  },
];

function Mark() {
  return (
    <svg width="23" height="31" viewBox="0 0 48.096 64.521" fill="#fff">
      <path
        transform="translate(1.074 0.004)"
        fillRule="evenodd"
        d="M 17.657 52.456 L 0 64.517 L 0 51.356 L 8.118 45.905 L 17.657 52.456 Z M 17.52 39.591 L 17.853 39.591 L 27.187 45.947 L 47.022 32.4 L 37.732 25.989 L 17.863 39.589 L 17.523 39.589 L 17.52 39.591 Z M 18.695 26.019 L 0.052 13.15 L 0.069 0 L 28.261 19.454 L 18.695 26.019 Z"
      />
      <path
        transform="translate(0 32.225)"
        d="M 47.022 32.291 L 0 0 L 18.929 0 L 47.022 19.13 L 47.022 32.291 Z"
      />
      <path
        transform="translate(0 0.001)"
        d="M 46.97 13.039 L 18.94 32.226 L 0 32.226 L 46.952 0 L 46.97 13.039 Z"
      />
    </svg>
  );
}

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
        background: "#000000",
        fontFamily: "Hanken Grotesk",
        overflow: "hidden",
      }}
    >
      {/* prism */}
      <div
        style={{
          position: "absolute",
          display: "flex",
          right: -96,
          top: HEIGHT / 2 - 410,
          width: 820,
          height: 820,
        }}
      >
        {LOBES.map((background) => (
          <div
            key={background}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 820,
              height: 820,
              borderRadius: 410,
              background,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: 402,
            top: 402,
            width: 16,
            height: 16,
            borderRadius: 8,
            background: "#FFEDEB",
          }}
        />
      </div>

      {/* rays converging on the core */}
      {RAYS.map((ray) => (
        <div
          key={ray.top}
          style={{
            position: "absolute",
            left: 0,
            top: ray.top,
            width: WIDTH,
            height: ray.height,
            background: ray.background,
            transform: `rotate(${ray.rotate}deg)`,
            transformOrigin: "left center",
          }}
        />
      ))}

      {/* scrim keeps the type column readable over the prism */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: WIDTH * 0.78,
          height: HEIGHT,
          background:
            "linear-gradient(90deg, #000 0%, rgba(0,0,0,.94) 46%, rgba(0,0,0,.6) 76%, rgba(0,0,0,0) 100%)",
        }}
      />

      {/* lockup */}
      <div
        style={{
          position: "absolute",
          left: 76,
          top: 76,
          display: "flex",
          alignItems: "center",
          gap: 15,
        }}
      >
        <Mark />
        <span
          style={{
            fontFamily: "Handjet",
            fontWeight: 700,
            fontSize: 30,
            lineHeight: 1,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#ffffff",
          }}
        >
          Coding Club
        </span>
      </div>

      {/* kicker / title / meta */}
      <div
        style={{
          position: "absolute",
          left: 76,
          bottom: 76,
          width: TITLE_COLUMN,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 24,
        }}
      >
        <div
          style={{
            fontFamily: "JetBrains Mono",
            fontWeight: 500,
            fontSize: 20,
            lineHeight: 1,
            letterSpacing: "0.19em",
            textTransform: "uppercase",
            color: "#C0E04A",
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            fontWeight: 700,
            fontSize: titleFontSize(title),
            lineHeight: 1.04,
            letterSpacing: "-0.03em",
            color: "#ffffff",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono",
            fontWeight: 400,
            fontSize: 21,
            lineHeight: 1,
            letterSpacing: "0.04em",
            color: "rgba(255,255,255,.62)",
          }}
        >
          {meta}
        </div>
      </div>

      {/* spectrum hairline */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: WIDTH,
          height: 7,
          background:
            "linear-gradient(90deg, #1D23A7 0%, #6E9FFC 22%, #C0E04A 44%, #FD6F43 66%, #FF4E41 83%, #A849EC 100%)",
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
