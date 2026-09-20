# Cloudio Audio Resolver Microservice

Microservice ringan berbasis **FastAPI** dan **pytubefix** untuk mengekstrak direct audio stream YouTube Music. Dirancang khusus untuk dipasangkan dengan Next.js saat di-deploy ke **Vercel**.

---

## 🚀 Cara Deploy Gratis

### Opsi A: Deploy di Render.com (Web Service Gratis)
1. Buat akun di [render.com](https://render.com).
2. Klik **New +** -> **Web Service**.
3. Hubungkan repository GitHub kamu (atau buat repository terpisah untuk folder `resolver-service`).
4. Atur konfigurasi:
   - **Root Directory**: `resolver-service` (jika dalam monorepo)
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Setelah selesai deploy, kamu akan mendapatkan URL seperti:
   `https://cloud-beats-resolver.onrender.com`
6. Masukkan URL tersebut ke **Environment Variables** di project Vercel:
   `RESOLVER_SERVICE_URL=https://cloud-beats-resolver.onrender.com`

---

### Opsi B: Deploy di Railway.app
1. Buat akun di [railway.app](https://railway.app).
2. New Project -> Deploy from GitHub repo -> Pilih folder `resolver-service`.
3. Railway akan otomatis mendeteksi `Procfile` / `Dockerfile` dan menjalankan service.
4. Salin domain public yang diberikan Railway ke `RESOLVER_SERVICE_URL` di Vercel.

---

## Pembaruan resolver 1.1.2

Versi ini memakai resolver yang dikirim dari server sebagai dasar. Deploy `main.py`
dan `requirements.txt` dari folder ini, install ulang dependensi, lalu restart service.
Deploy juga perubahan route API Next.js agar `refresh=1` diteruskan ke Python.
File sumber di Downloads tidak diubah.

- Request bersamaan untuk satu video berbagi satu pekerjaan resolve per proses.
- Kegagalan satu client tidak membatalkan kemungkinan sukses client lain.
- Error sementara tidak masuk negative cache; 404 disimpan hanya jika semua client
  menyatakan video tidak tersedia. Refresh eksplisit melewati cache.
- Masa berlaku cache URL CDN mengikuti `expire` bila tersedia, dengan margin 60 detik.
- Header `Range`, status 206/416, dan HEAD dipertahankan. Stream dibersihkan saat selesai.
- Setelah header stream diterima, pembacaan tidak memakai timeout per-chunk secara
  default. Ini mencegah audio terpotong ketika iOS menjeda koneksi saat lockscreen.
- Audio tetap `private, no-store`: prefetch terpisah tidak menjamin buffer browser
  dapat digunakan ulang. Resolver ini menyimpan metadata URL, bukan file audio.

Konfigurasi server:

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `STREAM_SECRET` | wajib | Pertahankan secret server yang sudah ada; jangan commit nilainya |
| `PUBLIC_BASE_URL` | `https://diskonsumopod.web.id` | URL publik resolver |
| `PORT` | `8081` | Port saat menjalankan `python main.py` |
| `RESOLVE_TIMEOUT` | `12` | Batas waktu satu pekerjaan resolve, detik |
| `STREAM_OPEN_TIMEOUT` | `35` | Batas total pembukaan stream termasuk retry, detik |
| `UPSTREAM_READ_TIMEOUT` | kosong | Opsional timeout antar-chunk; biarkan kosong untuk audio background |
| `PYTUBE_SOCKET_TIMEOUT` | `8` | Default timeout socket urllib milik pytubefix, detik |
| `RESOLVE_WORKERS` | `8` | Batas worker per proses, minimum 4 |
| `STREAM_CACHE_TTL` | `1800` | Batas cache URL CDN, detik |
| `STREAM_TOKEN_TTL` | `600` | Masa berlaku URL bertanda tangan, detik |

Thread yang sudah berjalan tidak bisa dihentikan oleh pembatalan async. Slot worker
baru dilepas setelah thread benar-benar selesai; ketika penuh, resolver mengembalikan
503 dengan `Retry-After` daripada menumpuk pekerjaan. Timeout socket membantu
membatasi I/O, tetapi bukan hard kill untuk seluruh pekerjaan pytubefix.
Cache dan koordinasi request berlaku per worker process, bukan lintas proses/server.

Uji regresi dari root project (tidak mengakses YouTube):

```bash
python -m unittest discover -s resolver-service -p 'test_*.py' -v
node --test tests/*.test.cjs
npx tsc --noEmit --incremental false
```

Tes menggunakan CDN dan hasil ekstraksi tiruan. Validasi lock screen iOS tetap
memerlukan versi terbaru yang sudah dideploy dan perangkat fisik.

Frontend menyiapkan dua penerus antrean: lagu terdekat menjalankan resolve dan
prefix Range 512 KB, sedangkan lagu kedua hanya menjalankan resolve metadata.
Persiapan yang sedang berjalan tetap dipertahankan ketika lagu tersebut berubah
menjadi current track, sehingga Next cepat tidak membatalkan resolve yang dibutuhkan.

## 🧪 Jalankan Lokal
```bash
cd resolver-service
pip install -r requirements.txt
# Isi STREAM_SECRET di resolver-service/.env sebelum menjalankan.
python main.py
```
Akses di browser: `http://localhost:8081/resolve?id=kJQP7kiw5Fk`
