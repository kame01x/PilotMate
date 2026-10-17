import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Same-origin proxy to the backend: the browser always calls this origin
  // (localhost OR LAN IP), and the Next server forwards to the loopback
  // backend. Avoids CORS, IPv6-vs-IPv4 localhost, and cross-device issues.
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: "http://127.0.0.1:8000/:path*",
      },
    ];
  },
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
