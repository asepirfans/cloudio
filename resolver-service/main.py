import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pytubefix import YouTube

app = FastAPI(
    title="Cloudio Audio Stream Resolver",
    description="Lightweight YouTube audio stream extraction microservice using pytubefix",
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
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "cloudio-resolver", "version": "1.0.0"}

@app.get("/resolve")
def resolve_stream(id: str = Query(..., description="YouTube video ID")):
    if not id or len(id.strip()) == 0:
        raise HTTPException(status_code=400, detail="Missing or invalid video ID")

    video_id = id.strip()
    url = f"https://www.youtube.com/watch?v={video_id}"
    last_err = None

    for client_name in ["ANDROID", "IOS", "MWEB"]:
        try:
            yt = YouTube(url, client=client_name)
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
            last_err = exc
            continue

    if last_err:
        raise HTTPException(status_code=500, detail=str(last_err))
    raise HTTPException(status_code=404, detail="No suitable audio stream found")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
