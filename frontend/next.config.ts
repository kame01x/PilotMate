import type { NextConfig } from "next";

// /api-proxy/* is forwarded to BACKEND_URL at request time by src/proxy.ts.
// Do not add a rewrites() entry for it: rewrites are baked at build time and
// would freeze a wrong backend URL into the build.

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
