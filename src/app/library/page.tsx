import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Library",
  description: "Your favorites, playlists, and play history.",
};

export default function LibraryPage() {
  return (
    <div className="px-4 pt-6 pb-2 max-w-2xl mx-auto">
      <h1
        className="text-2xl font-semibold tracking-tight mb-6"
        style={{ color: "var(--color-text-primary)" }}
      >
        Library
      </h1>

      {/* Placeholder until auth is wired up */}
      <div
        className="text-center py-20"
        style={{ color: "var(--color-text-muted)" }}
      >
        <p className="text-sm mb-1">Sign in to access your library.</p>
        <p className="text-xs">Your favorites, playlists, and history will appear here.</p>
      </div>
    </div>
  );
}
