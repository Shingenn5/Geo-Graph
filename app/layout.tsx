import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Geo Graph v5 — 3D Geological Explorer",
  description: "Explore 3D terrain, buildings, mapped geology, and exportable USDA soil survey reports.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

