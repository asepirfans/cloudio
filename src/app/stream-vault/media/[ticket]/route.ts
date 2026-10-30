import { NextRequest, NextResponse } from "next/server";
import { unmaskStreamUrl } from "@/audio/vault";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticket: string }> }
) {
  const { ticket: rawTicket } = await params;
  const ticket = rawTicket.replace(/\.m4a$/, "");
  const targetUrl = unmaskStreamUrl(ticket);

  if (targetUrl) {
    return NextResponse.redirect(targetUrl, {
      status: 307,
      headers: {
        "Cache-Control": "private, no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return NextResponse.json({ error: "Invalid stream ticket" }, { status: 404 });
}
