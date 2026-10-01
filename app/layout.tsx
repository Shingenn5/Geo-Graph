import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Geo Graph — Wellsite & Drilling",
  description: "Explore 3D wellsite terrain, public well records, mapped surface geology, and local LAS drilling logs.",
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

