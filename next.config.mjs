import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Limit for file upload API route
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  turbopack: {
    resolveAlias: {
      "@/styles": "./src/styles",
    },
  },
  sassOptions: {
    includePaths: [__dirname],
  },
};

export default nextConfig;
