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
};

export default nextConfig;
