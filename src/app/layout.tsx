import type { Metadata } from "next";
import { cookies } from "next/headers";
import "@/styles/globals.scss";
import Providers from "@/components/layout/Providers";
import { Inter, JetBrains_Mono, Hanken_Grotesk } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const jetBrainsMono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-jetbrains" });
const hankenGrotesk = Hanken_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-hanken" });

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
    <html
      lang="en"
      data-theme={theme}
      className={`${theme === "dark" ? "dark" : ""} ${inter.variable} ${jetBrainsMono.variable} ${hankenGrotesk.variable}`}
    >
      <head>
        {/* Google Fonts loaded via next/font */}
        {/* Material Symbols */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body-md bg-background text-on-surface antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
