import { NextRequest, NextResponse } from "next/server";
import { audiusProvider } from "@/music/audius/provider";


export const runtime = "nodejs";

interface CachedStream {
  url: string;
  mimeType: string;
  itag: number;
  duration?: number;
  expiresAt: number;
}

const streamCache = new Map<string, CachedStream>();

async function getStreamUrlForYtm(videoId: string, forceRefresh = false): Promise<{ url: string; duration?: number } | null> {
  const cached = streamCache.get(videoId);
  if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
    return { url: cached.url, duration: cached.duration };
  }

  const resolverServiceUrl = (process.env.RESOLVER_SERVICE_URL || "https://diskonsumopod.web.id").replace(/\/+$/, "");
  if (resolverServiceUrl) {
    try {
      const res = await fetch(`${resolverServiceUrl}/resolve?id=${encodeURIComponent(videoId)}${forceRefresh ? "&refresh=1" : ""}`, {
        cache: "no-store",
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
            // The resolver signs URLs for 10 minutes, not two hours.
            expiresAt: Math.min(
              Date.now() + 5 * 60 * 1000,
              parsed.expiresAt ? Number(parsed.expiresAt) * 1000 - 30000 : Date.now() + 60000
            ),
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
    // 1. Direct audio streaming proxy (handles HTTP Range requests with status 206 Partial Content)
    if (searchParams.get("audio") === "true" || searchParams.get("play") === "true") {
      const range = req.headers.get("range");
      const forwardHeaders: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Accept: "*/*",
      };
      if (range) {
        forwardHeaders["Range"] = range;
      }

      let streamFetchUrl: string | null = null;


      const resolverBase = (process.env.RESOLVER_SERVICE_URL || "https://diskonsumopod.web.id").replace(/\/+$/, "");
      if (provider === "ytm" && resolverBase) {
        streamFetchUrl = `${resolverBase}/stream?id=${encodeURIComponent(providerTrackId)}${forceRefresh ? "&refresh=1" : ""}`;
      } else {
        let streamUrl: string | null = null;
        if (provider === "ytm") {
          const resolved = await getStreamUrlForYtm(providerTrackId, forceRefresh);
          streamUrl = resolved?.url || null;
        } else if (provider === "audius") {
          const source = await audiusProvider.getStream(providerTrackId);
          streamUrl = source?.url || null;
        }

        if (!streamUrl) {
          return NextResponse.json({ error: "Stream unavailable" }, { status: 404 });
        }
        streamFetchUrl = streamUrl;
      }

      const fetchAudio = async (url: string) => {
        const controller = new AbortController();
        // Limit only the wait for headers, not the duration of the song.
        const timer = setTimeout(() => controller.abort(), 40000);
        try {
          return await fetch(url, {
            headers: forwardHeaders,
            cache: "no-store",
            signal: AbortSignal.any([req.signal, controller.signal]),
          });
        } finally {
          clearTimeout(timer);
        }
      };
      let streamRes = await fetchAudio(streamFetchUrl);

      // Upstream recovery: If audio fetch failed, clear cache and retry once with force-refresh
      if ([401, 403, 404, 410, 502].includes(streamRes.status) && provider === "ytm") {
        console.warn(`[API /stream] Upstream audio fetch failed (${streamRes.status}), retrying...`);
        await streamRes.body?.cancel();
        streamCache.delete(providerTrackId);
        if (resolverBase) {
          streamFetchUrl = `${resolverBase}/stream?id=${encodeURIComponent(providerTrackId)}&refresh=1`;
        } else {
          const retryResolved = await getStreamUrlForYtm(providerTrackId, true);
          if (retryResolved?.url) {
            streamFetchUrl = retryResolved.url;
          }
        }
        streamRes = await fetchAudio(streamFetchUrl);
      }

      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", streamRes.headers.get("content-type") || "audio/mp4");
      responseHeaders.set("Accept-Ranges", "bytes");
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Cache-Control", streamRes.headers.get("cache-control") || "private, no-store");
      if (streamRes.headers.has("retry-after")) {
        responseHeaders.set("Retry-After", streamRes.headers.get("retry-after")!);
      }

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

    // 2. Metadata / pre-warm response: resolves stream URL and returns JSON
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
