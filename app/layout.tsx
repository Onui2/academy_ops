import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "경영지원 운영 허브",
  description: "경영지원 통합 운영 시스템"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
