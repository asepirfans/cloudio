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

## 🧪 Jalankan Lokal
```bash
cd resolver-service
pip install -r requirements.txt
python main.py
```
Akses di browser: `http://localhost:8000/resolve?id=kJQP7kiw5Fk`
