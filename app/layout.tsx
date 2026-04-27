import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Academy Ops Hub",
  description: "Academy operations workflow dashboard"
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
