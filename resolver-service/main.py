import os
import time
import urllib.request
import urllib.error
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pytubefix import YouTube

app = FastAPI(
    title="Cloudio Audio Stream Resolver",
    description="Lightweight YouTube audio stream extraction and proxy microservice using pytubefix",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

cache: dict[str, dict] = {}

def get_stream_data(video_id: str):
    cached = cache.get(video_id)
    if cached and time.time() - cached["cached_at"] < 3600 * 2:
        return cached["data"]

    url = f"https://www.youtube.com/watch?v={video_id}"
    last_err = None

    for client_name in ["ANDROID", "IOS", "MWEB", "WEB"]:
        try:
            yt = YouTube(url, client=client_name)
            stream = (
                yt.streams.get_by_itag(140)
                or yt.streams.get_by_itag(139)
                or yt.streams.filter(only_audio=True, mime_type="audio/mp4").first()
                or yt.streams.get_audio_only()
            )

            if stream and stream.url:
                result = {
                    "url": stream.url,
                    "mimeType": stream.mime_type or "audio/mp4",
                    "itag": stream.itag,
                    "title": yt.title,
                    "duration": yt.length,
                }
                cache[video_id] = {"data": result, "cached_at": time.time()}
                return result
        except Exception as exc:
            last_err = exc
            continue

    if last_err:
        raise HTTPException(status_code=500, detail=str(last_err))
    raise HTTPException(status_code=404, detail="No suitable audio stream found")

@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "cloudio-resolver", "version": "1.0.0"}

@app.api_route("/resolve", methods=["GET", "HEAD"])
def resolve_stream(id: str = Query(..., description="YouTube video ID")):
    if not id or len(id.strip()) == 0:
        raise HTTPException(status_code=400, detail="Missing or invalid video ID")
    video_id = id.strip()
    return get_stream_data(video_id)

@app.api_route("/stream", methods=["GET", "HEAD"])
def proxy_audio_stream(request: Request, id: str = Query(..., description="YouTube video ID")):
    if not id or len(id.strip()) == 0:
        raise HTTPException(status_code=400, detail="Missing or invalid video ID")
    video_id = id.strip()
    data = get_stream_data(video_id)
    stream_url = data["url"]

    req = urllib.request.Request(
        stream_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
            "Accept": "*/*",
        },
    )
    range_header = request.headers.get("range")
    if range_header:
        req.add_header("Range", range_header)

    try:
        upstream = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as err:
        upstream = err

    resp_headers = {
        "Content-Type": upstream.headers.get("Content-Type", "audio/mp4"),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
    }
    if upstream.headers.get("Content-Range"):
        resp_headers["Content-Range"] = upstream.headers.get("Content-Range")
    if upstream.headers.get("Content-Length"):
        resp_headers["Content-Length"] = upstream.headers.get("Content-Length")

    if request.method == "HEAD":
        upstream.close()
        return Response(status_code=getattr(upstream, "status", 200), headers=resp_headers)

    def body_generator():
        try:
            while True:
                chunk = upstream.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            upstream.close()

    status_code = getattr(upstream, "status", 200)
    return StreamingResponse(
        body_generator(),
        status_code=status_code,
        headers=resp_headers,
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
