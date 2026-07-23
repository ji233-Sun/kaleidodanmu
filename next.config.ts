import type { NextConfig } from "next";

const runtimeConnectSource =
  process.env.NODE_ENV === "development" ? "connect-src 'self' ws:" : "connect-src 'none'";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "typeorm"],
  async headers() {
    return [
      {
        source: "/effect-runtime",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; ${runtimeConnectSource}; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
          },
        ],
      },
      {
        source: "/_next/static/media/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
