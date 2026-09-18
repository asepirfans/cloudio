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

  const pythonBin = "C:\\Users\\SAMJIN\\AppData\\Local\\Programs\\Python\\Python39\\python.exe";
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
    console.error("[getStreamUrlForYtm] Error resolving stream for", videoId, err);
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
      const range = req.headers.get("range");
      const forwardHeaders: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
      };
      if (range) {
        forwardHeaders["Range"] = range;
      }

      const streamRes = await fetch(streamUrl, {
        headers: forwardHeaders,
      });

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
