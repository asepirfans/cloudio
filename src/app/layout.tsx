import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { GlobalAudioEngine } from "@/components/player/GlobalAudioEngine";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { AppShell } from "@/components/layout/AppShell";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CloudBeats",
    template: "%s | CloudBeats",
  },
  description: "Independent music streaming. Fast, clean, mobile-first.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CloudBeats",
  },
  openGraph: {
    type: "music.playlist",
    siteName: "CloudBeats",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <body>
        <GlobalAudioEngine />
        <AppShell>
          {children}
        </AppShell>
        <MiniPlayer />
      </body>
    </html>
  );
}
