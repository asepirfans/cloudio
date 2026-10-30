import { NextRequest, NextResponse } from "next/server";
import { unmaskStreamUrl } from "@/audio/vault";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const vault = searchParams.get("vault");

  if (vault) {
    const targetUrl = unmaskStreamUrl(vault);
    if (targetUrl) {
      return NextResponse.redirect(targetUrl, {
        status: 307,
        headers: {
          "Cache-Control": "private, no-store",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }

  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing stream parameters" }, { status: 400 });
  }

  const resolverBase = (process.env.RESOLVER_SERVICE_URL || "https://resolver.cloudiolabs.my.id").replace(/\/+$/, "");
  const forceRefresh = searchParams.get("refresh") === "1";
  const redirectUrl = `${resolverBase}/stream?id=${encodeURIComponent(id)}${forceRefresh ? "&refresh=1" : ""}`;

  return NextResponse.redirect(redirectUrl, {
    status: 307,
    headers: {
      "Cache-Control": "private, no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
