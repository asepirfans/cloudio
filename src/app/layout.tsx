import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { GlobalAudioEngine } from "@/components/player/GlobalAudioEngine";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { QueueToast } from "@/components/ui/QueueToast";
import { AppShell } from "@/components/layout/AppShell";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://cloudio.app"),
  title: {
    default: "Cloudio",
    template: "%s | Cloudio",
  },
  description: "Independent music streaming. Fast, clean, mobile-first.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cloudio",
  },
  openGraph: {
    title: "Cloudio",
    description: "Independent music streaming. Fast, clean, mobile-first.",
    siteName: "Cloudio",
    type: "music.playlist",
    images: [
      {
        url: "/logo.png",
        width: 620,
        height: 658,
        alt: "Cloudio",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Cloudio",
    description: "Independent music streaming. Fast, clean, mobile-first.",
    images: ["/logo.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
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
        <ServiceWorkerRegister />
        <GlobalAudioEngine />
        <AppShell>
          {children}
        </AppShell>
        <QueueToast />
        <MiniPlayer />
      </body>
    </html>
  );
}
