import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description = "用一句话创造画面、动画与交互 —— AI 原生的可视化创作平台";

export const metadata: Metadata = {
  title: {
    default: "Kaleido Danmu",
    template: "%s · Kaleido Danmu",
  },
  description,
  applicationName: "Kaleido Danmu",
  // 生产环境改为真实域名；此处仅用于解析 OG 图片相对路径
  metadataBase: new URL("http://localhost:3000"),
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon-bg-white.svg" }],
  },
  openGraph: {
    title: "Kaleido Danmu",
    description,
    images: [{ url: "/logo.webp", alt: "Kaleido Danmu" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-page font-sans text-ink">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
