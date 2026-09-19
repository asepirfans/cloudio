import os
import time
import httpx
from fastapi import FastAPI, HTTPException, Query, Request
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

@app.get("/resolve")
def resolve_stream(id: str = Query(..., description="YouTube video ID")):
    if not id or len(id.strip()) == 0:
        raise HTTPException(status_code=400, detail="Missing or invalid video ID")
    video_id = id.strip()
    return get_stream_data(video_id)

@app.get("/stream")
async def proxy_audio_stream(request: Request, id: str = Query(..., description="YouTube video ID")):
    if not id or len(id.strip()) == 0:
        raise HTTPException(status_code=400, detail="Missing or invalid video ID")
    video_id = id.strip()
    data = get_stream_data(video_id)
    stream_url = data["url"]

    range_header = request.headers.get("range")
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Accept": "*/*",
    }
    if range_header:
        req_headers["range"] = range_header

    client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
    req = client.build_request("GET", stream_url, headers=req_headers)
    resp = await client.send(req, stream=True)

    resp_headers = {
        "Content-Type": resp.headers.get("content-type", "audio/mp4"),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
    }
    if "content-range" in resp.headers:
        resp_headers["Content-Range"] = resp.headers["content-range"]
    if "content-length" in resp.headers:
        resp_headers["Content-Length"] = resp.headers["content-length"]

    async def body_stream():
        try:
            async for chunk in resp.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(
        body_stream(),
        status_code=resp.status_code,
        headers=resp_headers,
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
