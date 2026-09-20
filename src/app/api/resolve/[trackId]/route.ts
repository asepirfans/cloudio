import { NextRequest, NextResponse } from "next/server";
import { audiusProvider } from "@/music/audius/provider";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  return handleResolve(req, await params);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  return handleResolve(req, await params);
}

async function handleResolve(
  req: NextRequest,
  { trackId }: { trackId: string }
) {
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

  try {
    const resolverBase = (process.env.RESOLVER_SERVICE_URL || "https://diskonsumopod.web.id").replace(/\/+$/, "");

    if (provider === "ytm" && resolverBase) {
      const res = await fetch(`${resolverBase}/resolve?id=${encodeURIComponent(providerTrackId)}${searchParams.get("refresh") === "1" ? "&refresh=1" : ""}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({
          status: "warmed",
          trackId: decoded,
          url: data.url,
          duration: data.duration,
          expiresAt: data.expiresAt,
        });
      }
      return NextResponse.json({ status: "error", trackId: decoded }, { status: res.status });
    } else if (provider === "audius") {
      const source = await audiusProvider.getStream(providerTrackId);
      if (source?.url) {
        return NextResponse.json({
          status: "warmed",
          trackId: decoded,
          url: source.url,
        });
      }
    }

    return NextResponse.json({ status: "unavailable", trackId: decoded }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", message: err?.message || "Resolver pre-warm timeout" },
      { status: 502 }
    );
  }
}
