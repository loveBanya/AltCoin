import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "알트코인 스캐너",
  description: "바이낸스 USDT 선물 MACD + 고점 대비 필터 스캐너",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
