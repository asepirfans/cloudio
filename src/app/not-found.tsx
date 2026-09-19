import Link from "next/link";
import { Disc, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="w-full max-w-md mx-auto px-4 py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-white/30">
        <Disc size={32} />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Halaman Tidak Ditemukan</h2>
      <p className="text-sm text-white/50 mb-6">
        Konten atau album yang Anda cari tidak tersedia atau tautan telah berubah.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent/90 text-white text-xs font-semibold transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Kembali ke Beranda</span>
      </Link>
    </div>
  );
}
