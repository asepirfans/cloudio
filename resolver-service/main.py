import os
import re
import time
import hmac
import base64
import hashlib
import asyncio
import socket
import threading
import logging
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit, parse_qs
from collections import defaultdict, deque
from contextlib import asynccontextmanager

import httpx
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pytubefix import YouTube
try:
    from pytubefix.exceptions import VideoUnavailable
except ImportError:
    VideoUnavailable = None

load_dotenv()

# =========================================================
# CONFIG
# =========================================================

PUBLIC_BASE_URL = os.getenv(
    "PUBLIC_BASE_URL",
    "https://diskonsumopod.web.id"
).rstrip("/")

STREAM_SECRET = os.getenv("STREAM_SECRET")

if not STREAM_SECRET:
    raise RuntimeError(
        "STREAM_SECRET environment variable is required. "
        "Set it in your .env file or shell before starting."
    )

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "https://diskonsumopod.web.id"
    ).split(",")
    if origin.strip()
]

STREAM_TOKEN_TTL = int(os.getenv("STREAM_TOKEN_TTL", "600"))   # 10 menit
STREAM_CACHE_TTL = int(os.getenv("STREAM_CACHE_TTL", "1800"))  # 30 menit
FORCE_IPV4 = os.getenv("FORCE_IPV4", "true").lower() == "true"

RESOLVE_TIMEOUT = float(os.getenv("RESOLVE_TIMEOUT", "12"))
STREAM_OPEN_TIMEOUT = float(os.getenv("STREAM_OPEN_TIMEOUT", "35"))
UPSTREAM_READ_TIMEOUT = os.getenv("UPSTREAM_READ_TIMEOUT")
RESOLVE_WORKERS = max(4, int(os.getenv("RESOLVE_WORKERS", "8")))
resolver_executor = ThreadPoolExecutor(max_workers=RESOLVE_WORKERS, thread_name_prefix="resolve")
resolver_slots = threading.BoundedSemaphore(RESOLVE_WORKERS)
inflight: dict[str, asyncio.Task] = {}
logger = logging.getLogger("cloudio.resolver")

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


# =========================================================
# OPTIONAL FORCE IPV4
# =========================================================

if FORCE_IPV4:
    _original_getaddrinfo = socket.getaddrinfo

    def getaddrinfo_ipv4(*args, **kwargs):
        responses = _original_getaddrinfo(*args, **kwargs)
        ipv4 = [r for r in responses if r[0] == socket.AF_INET]
        return ipv4 or responses

    socket.getaddrinfo = getaddrinfo_ipv4


# =========================================================
# HTTP CLIENT + LIFESPAN
# =========================================================

http_client: httpx.AsyncClient = None  # type: ignore


@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    # pytubefix uses urllib's default socket timeout, independently of HTTPX.
    previous_socket_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(float(os.getenv("PYTUBE_SOCKET_TIMEOUT", "8")))
    http_client = httpx.AsyncClient(
        # Opening is bounded separately. Once headers arrive, an audio stream
        # may legitimately idle while playback is paused or backgrounded.
        timeout=httpx.Timeout(
            connect=15.0,
            read=float(UPSTREAM_READ_TIMEOUT) if UPSTREAM_READ_TIMEOUT else None,
            write=15.0,
            pool=15.0,
        ),
        limits=httpx.Limits(
            max_keepalive_connections=50,
            max_connections=200,
        ),
        verify=True,
        follow_redirects=True,
    )
    try:
        yield
    finally:
        tasks = list(inflight.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await http_client.aclose()
        resolver_executor.shutdown(wait=False, cancel_futures=True)
        socket.setdefaulttimeout(previous_socket_timeout)


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="Cloudio Audio Stream Resolver",
    description="Audio metadata resolver and streaming proxy",
    version="1.1.2",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["Range", "Content-Type", "Authorization"],
    expose_headers=["Content-Length", "Content-Range", "Accept-Ranges"],
)


# =========================================================
# CACHE
# =========================================================

cache: dict[str, dict] = {}
error_cache: dict[str, dict] = {}
cache_lock = threading.RLock()

NEGATIVE_CACHE_TTL = 300  # 5 menit - jangan retry video yang unavailable

NOT_AVAILABLE_PHRASES = (
    "this video is not available",
    "video unavailable",
    "this video has been removed",
    "private video",
    "video is private",
)


def is_not_available_error(exc: Exception) -> bool:
    # Cek tipe exception pytubefix dulu
    if VideoUnavailable and isinstance(exc, VideoUnavailable):
        return True
    msg = str(exc).lower()
    return any(phrase in msg for phrase in NOT_AVAILABLE_PHRASES)


def get_cached_stream(video_id: str):
    with cache_lock:
        cached = cache.get(video_id)
        if cached:
            if time.time() < cached["expires_at"]:
                return cached["data"]
            cache.pop(video_id, None)
        err = error_cache.get(video_id)
        if err and time.time() - err["cached_at"] < NEGATIVE_CACHE_TTL:
            raise HTTPException(status_code=err["status"], detail=err["detail"])
        error_cache.pop(video_id, None)
        return None


def set_cached_stream(video_id: str, data: dict):
    now = time.time()
    expires_at = now + STREAM_CACHE_TTL
    try:
        upstream_expiry = float(parse_qs(urlsplit(data["url"]).query)["expire"][0])
        expires_at = min(expires_at, upstream_expiry - 60)
    except (KeyError, ValueError, IndexError):
        pass
    with cache_lock:
        cache[video_id] = {"data": data, "expires_at": expires_at}
        error_cache.pop(video_id, None)


def set_error_cache(video_id: str, status: int, detail: str):
    with cache_lock:
        error_cache[video_id] = {
            "status": status,
            "detail": detail,
            "cached_at": time.time(),
        }


# =========================================================
# VIDEO ID VALIDATION
# =========================================================

def validate_video_id(video_id: str) -> str:
    video_id = video_id.strip()
    if not VIDEO_ID_RE.fullmatch(video_id):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID")
    return video_id


# =========================================================
# STREAM TOKEN
# =========================================================

def generate_stream_token(video_id: str, expires: int) -> str:
    message = f"{video_id}:{expires}".encode()
    signature = hmac.new(
        STREAM_SECRET.encode(),
        message,
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(signature).decode().rstrip("=")


def verify_stream_token(video_id: str, expires: int, token: str):
    if expires < int(time.time()):
        raise HTTPException(status_code=403, detail="Stream URL expired")
    if expires > int(time.time()) + STREAM_TOKEN_TTL + 60:
        raise HTTPException(status_code=403, detail="Invalid stream expiry")
    expected = generate_stream_token(video_id, expires)
    if not hmac.compare_digest(expected, token):
        raise HTTPException(status_code=403, detail="Invalid stream token")


# =========================================================
# RATE LIMITER
# =========================================================

rate_store: dict[str, deque] = defaultdict(deque)
rate_lock = threading.Lock()


def check_rate_limit(request: Request, bucket: str, limit: int, window: int = 60):
    client_ip = (
        request.headers.get("cf-connecting-ip")
        or (request.client.host if request.client else "unknown")
    )
    key = f"{bucket}:{client_ip}"
    now = time.time()

    with rate_lock:
        requests = rate_store[key]

        # Geser window
        while requests and requests[0] <= now - window:
            requests.popleft()

        if len(requests) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Too many requests",
                headers={"Retry-After": str(window)},
            )

        requests.append(now)

        # Bersihkan key kosong supaya tidak memory leak
        if not requests:
            del rate_store[key]


# =========================================================
# PYTUBEFIX RESOLVER
# =========================================================

def _is_valid_audio_stream(stream) -> bool:
    """Pastikan stream adalah audio standar yang bisa diputar browser."""
    if not stream or not stream.url:
        return False
    url = stream.url
    # Tolak hanya stream SABR/UMP yang format-nya tidak bisa diputar browser biasa
    # sabr=1 dan ump=1 adalah indikator format internal YouTube
    # CATATAN: pot= adalah token auth normal, JANGAN diblokir
    if "sabr=1" in url or "ump=1" in url:
        return False
    # Wajib salah satu format audio yang bisa diputar browser
    mime = (stream.mime_type or "").lower()
    return mime.startswith("audio/")


def _try_client(youtube_url: str, client_name: str) -> dict:
    """Resolve stream dengan satu client. Raise jika gagal."""
    yt = YouTube(youtube_url, client=client_name)

    # Prioritas: itag 140 (AAC 128kbps), itag 139 (AAC 48kbps), lalu audio/mp4 lainnya
    candidates = [
        yt.streams.get_by_itag(140),
        yt.streams.get_by_itag(139),
        yt.streams.filter(only_audio=True, mime_type="audio/mp4").first(),
        yt.streams.filter(only_audio=True).first(),
    ]

    selected = next(
        (s for s in candidates if _is_valid_audio_stream(s)),
        None,
    )

    if not selected:
        raise ValueError(f"No valid audio stream from {client_name} (all streams are SABR/UMP format)")

    return {
        "url": selected.url,
        "mimeType": selected.mime_type or "audio/mp4",
        "itag": selected.itag,
        "title": yt.title,
        "duration": yt.length,
    }


def submit_client(youtube_url: str, client: str):
    # Cancelling an asyncio waiter cannot kill an executing Python thread.
    # Hold capacity until the underlying worker actually exits, with no backlog.
    if not resolver_slots.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="Resolver busy", headers={"Retry-After": "2"})
    try:
        future = resolver_executor.submit(_try_client, youtube_url, client)
    except BaseException:
        resolver_slots.release()
        raise
    future.add_done_callback(lambda _: resolver_slots.release())
    return asyncio.wrap_future(future)


async def resolve_uncached(video_id: str) -> dict:
    pending = set()
    errors = []
    try:
        async with asyncio.timeout(RESOLVE_TIMEOUT):
            for client in ["MWEB", "ANDROID", "IOS", "WEB"]:
                pending.add(submit_client(f"https://www.youtube.com/watch?v={video_id}", client))
            while pending:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                successes = []
                for future in done:
                    try:
                        successes.append(future.result())
                    except Exception as exc:
                        errors.append(exc)
                if successes:
                    result = successes[0]
                    set_cached_stream(video_id, result)
                    return result
                # One client's unavailable result does not rule out other clients.
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Audio resolution timed out") from exc
    finally:
        for future in pending:
            future.cancel()
        await asyncio.gather(*pending, return_exceptions=True)

    # Cache only an unavailable verdict agreed on by every attempted client.
    if len(errors) == 4 and all(is_not_available_error(error) for error in errors):
        detail = "Video not available in your region or has been removed"
        set_error_cache(video_id, 404, detail)
        raise HTTPException(status_code=404, detail=detail)
    raise HTTPException(status_code=502, detail="Unable to resolve audio stream")


async def resolve_in_thread(video_id: str, force_refresh: bool = False) -> dict:
    # All concurrent callers, including refresh requests, share the active job.
    task = inflight.get(video_id)
    if task is None:
        if not force_refresh:
            cached = get_cached_stream(video_id)
            if cached:
                return cached
        else:
            with cache_lock:
                cache.pop(video_id, None)
                error_cache.pop(video_id, None)
        task = asyncio.create_task(resolve_uncached(video_id))
        inflight[video_id] = task

        def finished(completed):
            if inflight.get(video_id) is completed:
                inflight.pop(video_id, None)
            # Retrieve errors even when every HTTP client has disconnected.
            if not completed.cancelled():
                completed.exception()

        task.add_done_callback(finished)
    # A cancelled preload must not cancel another listener's playback request.
    return await asyncio.shield(task)


# =========================================================
# HEALTH
# =========================================================

@app.get("/")
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "cloudio-resolver", "version": "1.1.2"}


# =========================================================
# RESOLVE
# =========================================================

@app.api_route("/resolve", methods=["GET", "HEAD"])
async def resolve_stream(
    request: Request,
    id: str = Query(..., description="YouTube video ID"),
    refresh: bool = Query(False),
):
    check_rate_limit(request, bucket="resolve", limit=30)

    video_id = validate_video_id(id)
    data = await resolve_in_thread(video_id, force_refresh=refresh)

    expires = int(time.time()) + STREAM_TOKEN_TTL
    token = generate_stream_token(video_id, expires)

    stream_url = (
        f"{PUBLIC_BASE_URL}/stream"
        f"?id={video_id}"
        f"&exp={expires}"
        f"&sig={token}"
    )

    return {
        "url": stream_url,
        "mimeType": data["mimeType"],
        "itag": data["itag"],
        "title": data["title"],
        "duration": data["duration"],
        "expiresAt": expires,
    }


# =========================================================
# STREAM
# =========================================================

@app.api_route("/stream", methods=["GET", "HEAD"])
async def proxy_audio_stream(
    request: Request,
    id: str = Query(...),
    exp: Optional[int] = Query(None),
    sig: Optional[str] = Query(None),
    refresh: bool = Query(False),
):
    check_rate_limit(request, bucket="stream", limit=240)

    video_id = validate_video_id(id)
    # Verifikasi token hanya jika exp & sig disertakan
    if exp is not None and sig is not None:
        verify_stream_token(video_id, exp, sig)

    upstream_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
    }
    range_header = request.headers.get("range")
    if range_header:
        upstream_headers["Range"] = range_header

    upstream = None
    try:
        # Bound the entire opening phase, including resolves and retries.
        async with asyncio.timeout(STREAM_OPEN_TIMEOUT):
            data = await resolve_in_thread(video_id, force_refresh=refresh)
            for attempt in range(2):
                try:
                    req = http_client.build_request(request.method, data["url"], headers=upstream_headers)
                    upstream = await http_client.send(req, stream=True)
                except httpx.RequestError:
                    if attempt == 1:
                        raise HTTPException(status_code=502, detail="Failed to connect to upstream audio CDN")
                    data = await resolve_in_thread(video_id, force_refresh=True)
                    continue
                status = upstream.status_code
                if status in (200, 206):
                    break
                content_range = upstream.headers.get("content-range")
                await upstream.aclose()
                upstream = None
                if status == 416:
                    return Response(status_code=416, headers={
                        **({"Content-Range": content_range} if content_range else {}),
                        "Cache-Control": "no-store",
                    })
                if attempt == 0 and status in (401, 403, 404, 410):
                    data = await resolve_in_thread(video_id, force_refresh=True)
                    continue
                raise HTTPException(status_code=502, detail=f"Upstream returned HTTP {status}")
    except TimeoutError as exc:
        if upstream is not None:
            await upstream.aclose()
        raise HTTPException(status_code=504, detail="Audio stream opening timed out") from exc
    except BaseException:
        if upstream is not None:
            await upstream.aclose()
        raise

    if upstream is None:
        raise HTTPException(status_code=502, detail="Failed to open audio stream")

    response_headers = {
        "Content-Type": upstream.headers.get("content-type", data["mimeType"]),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
    }

    for upstream_key, response_key in {
        "content-range": "Content-Range",
        "content-length": "Content-Length",
        "etag": "ETag",
        "last-modified": "Last-Modified",
        "content-encoding": "Content-Encoding",
    }.items():
        value = upstream.headers.get(upstream_key)
        if value:
            response_headers[response_key] = value

    if request.method == "HEAD":
        status_code = upstream.status_code
        await upstream.aclose()
        return Response(status_code=status_code, headers=response_headers)

    async def audio_generator():
        try:
            async for chunk in upstream.aiter_raw():
                if chunk:
                    yield chunk
        except httpx.RequestError:
            # Headers have already been sent: surface a broken stream rather
            # than pretending EOF was a complete audio file. The player retries.
            logger.warning("Upstream audio interrupted for %s", video_id)
            raise
        finally:
            await upstream.aclose()

    return StreamingResponse(
        audio_generator(),
        status_code=upstream.status_code,
        headers=response_headers,
        media_type=response_headers["Content-Type"],
    )


# =========================================================
# ENTRYPOINT
# =========================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8081"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
