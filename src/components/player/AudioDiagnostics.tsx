"use client";

import { useState } from "react";
import { audioLogger } from "@/audio/logger";

export function AudioDiagnostics() {
  const [message, setMessage] = useState("");
  const download = () => {
    const blob = new Blob([audioLogger.exportDiagnostics()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cloudio-audio-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setMessage("Laporan disiapkan. Kamu bisa mengirim file ini saat melaporkan musik macet.");
  };
  return (
    <details className="my-4 rounded-xl border border-white/10 p-3 text-sm text-white/70">
      <summary className="cursor-pointer">Bantuan pemutaran</summary>
      <p className="mt-3 text-xs">Jika musik macet, simpan laporan setelah membuka aplikasi. Catatan disimpan di perangkat ini dan tidak dikirim otomatis.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={download} className="rounded-lg bg-white/10 px-3 py-2 text-white">Simpan laporan audio</button>
        <button type="button" onClick={() => { audioLogger.clear(); setMessage("Catatan dihapus."); }} className="rounded-lg px-3 py-2">Hapus catatan</button>
      </div>
      <p role="status" className="mt-2 text-xs">{message}</p>
    </details>
  );
}
