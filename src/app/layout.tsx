import type { Metadata } from "next";
import { cookies } from "next/headers";
import "@/styles/globals.scss";
import Providers from "@/components/layout/Providers";

export const metadata: Metadata = {
  title: "Coding Club IITG",
  description: "Internal Workspace for Coding Club IITG",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="en" data-theme={theme} className={theme === "dark" ? "dark" : ""}>
      <head>
        {/* Google Fonts */}
        <link href="https://fonts.googleapis.com" rel="preconnect" />
        <link crossOrigin="anonymous" href="https://fonts.gstatic.com" rel="preconnect" />
        <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600;700&family=Inter:wght@400&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
        {/* Material Symbols */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body-md bg-background text-on-surface antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
