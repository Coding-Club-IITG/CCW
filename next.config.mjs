/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Limit for file upload API route
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  sassOptions: {
    // Allow bare/relative imports inside _index.scss partials to resolve
    // correctly even when the file is loaded via the @/styles alias.
    // resolve-url-loader strips the file-system context in that case,
    // so we give Dart Sass explicit load paths as a fallback.
    loadPaths: ["./src/styles", "./src/styles/mixins"],
    includePaths: ["./src/styles", "./src/styles/mixins"],
  },
  turbopack: {
    resolveAlias: {
      "@/styles": "./src/styles",
    },
  },
};

export default nextConfig;
