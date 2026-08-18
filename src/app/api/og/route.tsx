import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { SITE_NAME } from "@/lib/seo";

export const revalidate = 86400;

export function boundedTitle(value: string | null) {
  const clean = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(clean || SITE_NAME)
    .slice(0, 120)
    .join("");
}

export async function GET(request: NextRequest) {
  const title = boundedTitle(request.nextUrl.searchParams.get("title"));

  // TODO: Replace later with 1200×630 cover
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
        color: "white",
        background: "#111827",
        fontFamily: "sans-serif",
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
        }}
      >
        <div style={{ display: "flex", fontSize: 30 }}>{SITE_NAME}</div>
        <div
          style={{
            display: "flex",
            maxWidth: 1040,
            fontSize: title.length > 80 ? 48 : 60,
            lineHeight: 1.15,
            fontWeight: 700,
          }}
        >
          {title}
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
