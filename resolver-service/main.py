import os
import time
import socket
import ssl
import urllib.request
import urllib.error
import httpx
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pytubefix import YouTube

# Force IPv4 to prevent Windows/ISP IPv6 TLS handshake timeouts on Google Video CDN
old_getaddrinfo = socket.getaddrinfo
def getaddrinfo_ipv4(*args, **kwargs):
    responses = old_getaddrinfo(*args, **kwargs)
    return [r for r in responses if r[0] == socket.AF_INET] or responses
socket.getaddrinfo = getaddrinfo_ipv4

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

# SSL context that avoids Windows OpenSSL handshake freezes on dynamic CDN nodes
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

def get_stream_data(video_id: str, force_refresh = False):
    if not force_refresh:
        cached = cache.get(video_id)
        if cached and time.time() - cached["cached_at"] < 3600 * 2:
            return cached["data"]

    url = f"https://www.youtube.com/watch?v={video_id}"
    last_err = None

    # Prioritize MWEB: YouTube returns clean audio/mp4 (AAC) without SABR/UMP packet format
    for client_name in ["MWEB", "ANDROID", "IOS", "WEB"]:
        try:
            yt = YouTube(url, client=client_name)
            candidates = [
                yt.streams.get_by_itag(140),
                yt.streams.get_by_itag(139),
                yt.streams.filter(only_audio=True, mime_type="audio/mp4").first(),
                yt.streams.filter(only_audio=True).first(),
                yt.streams.get_audio_only(),
            ]

            for stream in candidates:
                if stream and stream.url and "sabr=1" not in stream.url:
                    result = {
                        "url": stream.url,
                        "mimeType": stream.mime_type or "audio/mp4",
                        "itag": stream.itag,
                        "title": yt.title,
                        "duration": yt.length,
                    }
                    cache[video_id] = {"data": result, "cached_at": time.time()}
                    return result

            # Fallback if all streams had sabr
            fallback = yt.streams.get_by_itag(140) or yt.streams.get_audio_only()
            if fallback and fallback.url:
                result = {
                    "url": fallback.url,
                    "mimeType": fallback.mime_type or "audio/mp4",
                    "itag": fallback.itag,
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

# Global Async HTTP client with connection pooling for high concurrency
http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(connect=15.0, read=60.0, write=15.0, pool=15.0),
    limits=httpx.Limits(max_keepalive_connections=100, max_connections=500),
    verify=False,
    follow_redirects=True,
)

@app.api_route("/stream", methods=["GET", "HEAD"])
async def proxy_audio_stream(request: Request, id: str = Query(..., description="YouTube video ID")):
    if not id or len(id.strip()) == 0:
        raise HTTPException(status_code=400, detail="Missing or invalid video ID")
    video_id = id.strip()

    data = get_stream_data(video_id)
    stream_url = data["url"]

    range_header = request.headers.get("range")
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        "Accept": "*/*",
    }
    if range_header:
        req_headers["Range"] = range_header

    upstream = None
    last_exc = None

    for attempt in range(3):
        try:
            req = http_client.build_request("GET", stream_url, headers=req_headers)
            upstream = await http_client.send(req, stream=True)
            if upstream.status_code in [200, 206]:
                break
            # If CDN returns non-success (e.g. 403 expired), refresh link
            await upstream.aclose()
            if attempt < 2:
                data = get_stream_data(video_id, force_refresh=True)
                stream_url = data["url"]
        except Exception as exc:
            last_exc = exc
            if attempt < 2:
                try:
                    data = get_stream_data(video_id, force_refresh=True)
                    stream_url = data["url"]
                except Exception:
                    pass

    if upstream is None or upstream.is_closed:
        raise HTTPException(status_code=502, detail=f"Failed to connect to audio CDN: {last_exc}")

    resp_headers = {
        "Content-Type": upstream.headers.get("content-type", "audio/mp4"),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
    }
    if "content-range" in upstream.headers:
        resp_headers["Content-Range"] = upstream.headers["content-range"]
    if "content-length" in upstream.headers:
        resp_headers["Content-Length"] = upstream.headers["content-length"]

    if request.method == "HEAD":
        await upstream.aclose()
        return Response(status_code=upstream.status_code, headers=resp_headers)

    async def body_generator():
        try:
            async for chunk in upstream.aiter_bytes(chunk_size=65536):
                yield chunk
        except Exception:
            pass
        finally:
            await upstream.aclose()

    return StreamingResponse(
        body_generator(),
        status_code=upstream.status_code,
        headers=resp_headers,
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
