import { NextRequest, NextResponse } from "next/server";
import { audiusProvider } from "@/music/audius/provider";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

interface CachedStream {
  url: string;
  mimeType: string;
  itag: number;
  duration?: number;
  cachedAt: number;
}

const streamCache = new Map<string, CachedStream>();

async function getStreamUrlForYtm(videoId: string, forceRefresh = false): Promise<{ url: string; duration?: number } | null> {
  const cached = streamCache.get(videoId);
  // Cache for 2 hours (Googlevideo URLs typically expire in 6 hours)
  if (!forceRefresh && cached && Date.now() - cached.cachedAt < 2 * 60 * 60 * 1000) {
    return { url: cached.url, duration: cached.duration };
  }

  // 1. Primary: Python FastAPI resolver service (custom RESOLVER_SERVICE_URL, Vercel Serverless, or local port 8000)
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const defaultResolverUrl = vercelHost
    ? `https://${vercelHost}/api/py`
    : "http://127.0.0.1:8000";
  const resolverServiceUrl = (process.env.RESOLVER_SERVICE_URL || defaultResolverUrl).replace(/\/+$/, "");
  if (resolverServiceUrl) {
    try {
      const res = await fetch(`${resolverServiceUrl}/resolve?id=${encodeURIComponent(videoId)}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const parsed = await res.json();
        if (parsed.url) {
          streamCache.set(videoId, {
            url: parsed.url,
            mimeType: parsed.mimeType || "audio/mp4",
            itag: parsed.itag || 140,
            duration: parsed.duration,
            cachedAt: Date.now(),
          });
          return { url: parsed.url, duration: parsed.duration };
        }
      } else {
        console.warn(`[getStreamUrlForYtm] Python resolver returned status ${res.status}`);
      }
    } catch (err) {
      console.error("[getStreamUrlForYtm] Python resolver error:", err);
    }
  }

  // 2. Fallback: Local Python script execution via pytubefix
  const pythonBin =
    process.env.PYTHON_BIN ||
    (process.platform === "win32"
      ? "C:\\Users\\SAMJIN\\AppData\\Local\\Programs\\Python\\Python39\\python.exe"
      : "python3");
  const scriptPath = path.join(process.cwd(), "scripts", "resolve_stream.py");

  try {
    const { stdout } = await execFileAsync(pythonBin, [scriptPath, videoId], {
      timeout: 15000,
    });
    const parsed = JSON.parse(stdout);
    if (parsed.url) {
      streamCache.set(videoId, {
        url: parsed.url,
        mimeType: parsed.mimeType || "audio/mp4",
        itag: parsed.itag || 140,
        duration: parsed.duration,
        cachedAt: Date.now(),
      });
      return { url: parsed.url, duration: parsed.duration };
    }
  } catch (err) {
    console.error("[getStreamUrlForYtm] Local Python script error for", videoId, err);
  }

  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  const { trackId } = await params;

  if (!trackId) {
    return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
  }

  const decoded = decodeURIComponent(trackId);
  const parts = decoded.split(":");
  let provider = parts.length > 1 ? parts[0] : null;
  const providerTrackId = parts.length > 1 ? parts.slice(1).join(":") : decoded;

  const searchParams = req.nextUrl.searchParams;
  if (!provider) {
    provider = searchParams.get("provider") || "ytm";
  }

  const forceRefresh = searchParams.get("refresh") === "1";

  try {
    let streamUrl: string | null = null;
    let trackDuration: number | undefined = undefined;

    if (provider === "ytm") {
      const resolved = await getStreamUrlForYtm(providerTrackId, forceRefresh);
      streamUrl = resolved?.url || null;
      trackDuration = resolved?.duration;
    } else if (provider === "audius") {
      const source = await audiusProvider.getStream(providerTrackId);
      streamUrl = source?.url || null;
    }

    if (!streamUrl) {
      return NextResponse.json({ error: "Stream unavailable" }, { status: 404 });
    }

    // Direct audio streaming proxy (handles HTTP Range requests with status 206 Partial Content)
    if (searchParams.get("audio") === "true" || searchParams.get("play") === "true") {
      // If custom external resolver (e.g. Cloudflare Tunnel to local PC) is configured,
      // redirect client directly to the resolver's streaming proxy for 0ms Vercel overhead and flawless range streaming!
      if (provider === "ytm" && process.env.RESOLVER_SERVICE_URL) {
        const resolverBase = process.env.RESOLVER_SERVICE_URL.replace(/\/+$/, "");
        return NextResponse.redirect(`${resolverBase}/stream?id=${encodeURIComponent(providerTrackId)}`);
      }

      const range = req.headers.get("range");
      const forwardHeaders: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Accept: "*/*",
      };
      if (range) {
        forwardHeaders["Range"] = range;
      }

      let streamRes = await fetch(streamUrl, {
        headers: forwardHeaders,
      });

      // Upstream recovery: If Googlevideo returns 403 Forbidden or expired token, clear cache and re-resolve once
      if (!streamRes.ok && streamRes.status !== 206 && provider === "ytm") {
        console.warn(`[API /stream] Upstream audio fetch failed (${streamRes.status}), re-resolving with force-refresh...`);
        streamCache.delete(providerTrackId);
        const retryResolved = await getStreamUrlForYtm(providerTrackId, true);
        if (retryResolved?.url) {
          streamUrl = retryResolved.url;
          streamRes = await fetch(streamUrl, { headers: forwardHeaders });
        }
      }

      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", streamRes.headers.get("content-type") || "audio/mp4");
      responseHeaders.set("Accept-Ranges", "bytes");
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Cache-Control", "public, max-age=3600");

      if (streamRes.headers.get("content-range")) {
        responseHeaders.set("Content-Range", streamRes.headers.get("content-range")!);
      }
      if (streamRes.headers.get("content-length")) {
        responseHeaders.set("Content-Length", streamRes.headers.get("content-length")!);
      }

      return new Response(streamRes.body, {
        status: streamRes.status,
        headers: responseHeaders,
      });
    }

    // Metadata response: points client HTML5 audio element to our direct streaming proxy
    return NextResponse.json({
      source: {
        url: `/api/stream/${encodeURIComponent(decoded)}?audio=true`,
        type: "direct",
        provider,
        duration: trackDuration,
      },
    });
  } catch (err) {
    console.error("[API /stream]", err);
    return NextResponse.json({ error: "Stream resolution failed" }, { status: 502 });
  }
}
