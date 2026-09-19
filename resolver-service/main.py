import os
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pytubefix import YouTube

app = FastAPI(
    title="Cloudio Audio Stream Resolver",
    description="Lightweight YouTube audio stream extraction microservice using pytubefix",
    version="1.0.0",
)

# Enable CORS for Next.js or direct client calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "cloudio-resolver", "version": "1.0.0"}

@app.get("/resolve")
def resolve_stream(id: str = Query(..., description="YouTube video ID")):
    if not id or len(id.strip()) == 0:
        raise HTTPException(status_code=400, detail="Missing or invalid video ID")

    video_id = id.strip()
    url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        yt = YouTube(url, use_po_token=False)

        # Prioritize AAC audio streams (itag 140 = 128kbps, 139 = 48kbps)
        # WebM/Opus can have inconsistent duration headers in browsers.
        stream = (
            yt.streams.get_by_itag(140)
            or yt.streams.get_by_itag(139)
            or yt.streams.filter(only_audio=True, mime_type="audio/mp4").first()
            or yt.streams.get_audio_only()
        )

        if not stream or not stream.url:
            raise HTTPException(status_code=404, detail="No suitable audio stream found")

        return {
            "url": stream.url,
            "mimeType": stream.mime_type,
            "itag": stream.itag,
            "title": yt.title,
            "duration": yt.length,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
