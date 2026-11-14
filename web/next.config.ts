import type { NextConfig } from "next";

// Static export — hasil build (web/out) dilayani Express backend sebagai file statis.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Dev-only proxy ke backend Express supaya `next dev` bisa dipakai langsung.
  ...(process.env.NODE_ENV === "development"
    ? {
        rewrites: async () => [
          {
            source: "/api/:path*",
            destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/:path*`,
          },
        ],
      }
    : {}),
};

export default nextConfig;
