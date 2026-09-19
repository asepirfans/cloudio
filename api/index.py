import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pytubefix import YouTube

app = FastAPI(
    title="Cloudio Stream Resolver",
    description="Vercel Serverless Audio Stream Resolver",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
@app.get("/api/py")
@app.get("/api/py/health")
def health_check():
    return {"status": "ok", "service": "cloudio-resolver-vercel", "version": "1.0.0"}

@app.get("/resolve")
@app.get("/api/py/resolve")
def resolve_stream(id: str = Query(..., description="YouTube video ID")):
    if not id or len(id.strip()) == 0:
        raise HTTPException(status_code=400, detail="Missing or invalid video ID")

    video_id = id.strip()
    url = f"https://www.youtube.com/watch?v={video_id}"

    # Use clients that bypass datacenter IP bot detection (ANDROID, IOS, MWEB)
    clients_to_try = ["ANDROID", "IOS", "MWEB"]
    last_error = None

    for client_name in clients_to_try:
        try:
            yt = YouTube(url, client=client_name)

            # Prioritize clean AAC audio stream (itag 140 = 128kbps, 139 = 48kbps)
            stream = (
                yt.streams.get_by_itag(140)
                or yt.streams.get_by_itag(139)
                or yt.streams.filter(only_audio=True, mime_type="audio/mp4").first()
                or yt.streams.get_audio_only()
            )

            if stream and stream.url:
                return {
                    "url": stream.url,
                    "mimeType": stream.mime_type or "audio/mp4",
                    "itag": stream.itag,
                    "title": yt.title,
                    "duration": yt.length,
                }
        except Exception as exc:
            last_error = exc
            continue

    if last_error:
        raise HTTPException(status_code=500, detail=str(last_error))
    raise HTTPException(status_code=404, detail="No suitable audio stream found")
