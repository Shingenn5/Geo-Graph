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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{__html: 'try{document.documentElement.dataset.theme=localStorage.getItem("geo-graph-theme")==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}'}} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="preconnect" href="https://tiles.mapterhorn.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://server.arcgisonline.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

