import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Geo Graph — 3D Geological Explorer",
  description: "Explore 3D terrain, satellite imagery, topography, rock units, and mapped faults.",
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

