/**
 * Efficient audio streaming proxy using Node.js http/https piping.
 * Used as fallback when direct YouTube URLs fail CORS in the browser.
 * Usage: GET /api/proxy?url=<encoded_stream_url>
 */
import { NextRequest } from "next/server";
import https from "https";
import http from "http";
import { URL } from "url";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new Response("Missing url param", { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return new Response("Invalid url param", { status: 400 });
  }

  const rangeHeader = req.headers.get("range");

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Encoding": "identity",
    Connection: "keep-alive",
  };
  if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  return new Promise<Response>((resolve) => {
    const lib = targetUrl.protocol === "https:" ? https : http;

    const proxyReq = lib.request(
      {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: "GET",
        headers: upstreamHeaders,
      },
      (proxyRes) => {
        const responseHeaders = new Headers();
        responseHeaders.set("Content-Type", (proxyRes.headers["content-type"] as string) || "audio/mp4");
        responseHeaders.set("Accept-Ranges", "bytes");
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Allow-Headers", "Range, Accept-Ranges, Content-Type");
        responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
        responseHeaders.set("Cache-Control", "public, max-age=3600");

        if (proxyRes.headers["content-range"]) {
          responseHeaders.set("Content-Range", proxyRes.headers["content-range"] as string);
        }
        if (proxyRes.headers["content-length"]) {
          responseHeaders.set("Content-Length", proxyRes.headers["content-length"] as string);
        }

        // Use a ReadableStream that pipes from Node IncomingMessage
        const nodeStream = proxyRes;
        const readable = new ReadableStream({
          start(controller) {
            nodeStream.on("data", (chunk: Buffer) => {
              controller.enqueue(new Uint8Array(chunk));
            });
            nodeStream.on("end", () => controller.close());
            nodeStream.on("error", (err) => controller.error(err));
          },
          cancel() {
            nodeStream.destroy();
          },
        });

        resolve(
          new Response(readable, {
            status: proxyRes.statusCode || 200,
            headers: responseHeaders,
          })
        );
      }
    );

    proxyReq.on("error", (err) => {
      console.error("[/api/proxy] upstream error:", err);
      resolve(new Response("Upstream error", { status: 502 }));
    });

    proxyReq.end();
  });
}
