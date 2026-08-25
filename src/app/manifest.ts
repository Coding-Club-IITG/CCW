import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coding Club IITG",
    short_name: "CC IITG",
    start_url: "/internal/dashboard",
    display: "standalone",
    background_color: "#0d1117",
    theme_color: "#58a6ff",
    // TODO
    icons: [
      { src: "/icons/cc-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icons/cc-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
