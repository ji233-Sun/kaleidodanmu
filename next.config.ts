import type { NextConfig } from "next";

const runtimeConnectSource =
  process.env.NODE_ENV === "development" ? "connect-src 'self' ws:" : "connect-src 'none'";

const nextConfig: NextConfig = {
  transpilePackages: ["@kaleido/sdk"],
  serverExternalPackages: ["better-sqlite3", "typeorm"],
  async headers() {
    return [
      {
        source: "/effect-runtime",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; ${runtimeConnectSource}; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
          },
        ],
      },
      {
        // 运行时 vendor（three/gsap/@kaleido-sdk）由不透明源沙箱跨源以模块方式加载，需要 CORS。
        source: "/kaleido-runtime/vendor/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      {
        source: "/_next/static/media/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
