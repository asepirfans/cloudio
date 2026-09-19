import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Audius artwork CDN
      { protocol: "https", hostname: "*.audius.co" },
      { protocol: "https", hostname: "audius.co" },
      { protocol: "https", hostname: "creatornode.audius.co" },
      { protocol: "https", hostname: "*.creatornode.audius.co" },
      { protocol: "https", hostname: "blockdaemon-audius-content-*.audius.co" },
      // Catch-all for dynamic Audius CDN subdomains
      { protocol: "https", hostname: "*.audius.prod" },
      // YouTube Music artwork CDNs
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "*.ytimg.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  // Prevent the app from being embedded in iframes (security)
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer-when-downgrade" },
      ],
    },
  ],
  // Allow mobile and local network access in development
  allowedDevOrigins: [
    "192.168.100.242",
    "192.168.100.242:3000",
    "192.168.100.227",
    "192.168.100.227:3000",
    "192.168.15.157",
    "localhost:3000",
  ],
  rewrites: async () => [
    {
      source: "/api/py/:path*",
      destination:
        process.env.NODE_ENV === "development"
          ? "http://127.0.0.1:8000/api/py/:path*"
          : "/api/index.py",
    },
  ],
};

export default nextConfig;
