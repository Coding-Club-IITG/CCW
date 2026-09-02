import type { Metadata } from "next";
import { Handjet, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "@/styles/globals.scss";
import Providers from "@/components/layout/Providers";
import { ogImage, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import { webEnv } from "@/lib/env/web";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "CC IITG" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "/icons/cc-apple-touch.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: ogImage(SITE_NAME), width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [ogImage(SITE_NAME)],
  },
};

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken-grotesk",
});

const handjet = Handjet({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-handjet",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value === "light" ? "light" : "dark";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${hankenGrotesk.variable} ${handjet.variable} ${jetBrainsMono.variable}`}
    >
      <body>
        <Providers
          runtimeConfig={{
            developmentAuthEnabled: webEnv.DEV_AUTH_ENABLED,
            userRateLimitsEnabled: !webEnv.DEV_DISABLE_USER_RATE_LIMITS,
          }}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
