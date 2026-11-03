import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lightly.io embeds the booking widget (public/embed.js), which calls these APIs from
  // another origin. They use no cookies or logins, so any origin may call them; where
  // clients are sent after paying is checked separately (lib/config.ts, returnOrigins).
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
      {
        source: "/embed.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=300" }],
      },
    ];
  },
};

export default nextConfig;
