import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

// In-memory cache for translated lyrics: key -> { translated: string[], sourceLang: string }
const translationCache = new Map<string, { translated: string[]; sourceLang: string }>();

function getCacheKey(lines: string[], targetLang: string): string {
  // Hash sample lines + count
  const sample = lines.slice(0, 5).join("|");
  return `${targetLang}:${lines.length}:${sample}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lines, targetLang = "id" } = body as { lines: string[]; targetLang?: string };

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: "Missing or invalid lines array" }, { status: 400 });
    }

    const cacheKey = getCacheKey(lines, targetLang);
    if (translationCache.has(cacheKey)) {
      return NextResponse.json(translationCache.get(cacheKey));
    }

    // Keep track of non-empty line indices
    const nonEmptyItems: { idx: number; text: string }[] = [];
    lines.forEach((line, idx) => {
      const clean = line ? line.trim() : "";
      if (clean.length > 0) {
        nonEmptyItems.push({ idx, text: clean });
      }
    });

    if (nonEmptyItems.length === 0) {
      return NextResponse.json({ translated: new Array(lines.length).fill(""), sourceLang: "auto" });
    }

    const textToTranslate = nonEmptyItems.map((item) => item.text).join("\n");

    let stdout = "";
    try {
      const res = await execFileAsync(
        "curl",
        [
          "-s",
          "-X",
          "POST",
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`,
          "--data-urlencode",
          `q=${textToTranslate}`,
        ],
        { timeout: 10000 }
      );
      stdout = res.stdout;
    } catch {
      // Fallback using python3 urllib if curl fails
      const pythonScript = `
import urllib.request, urllib.parse, json, sys
data = urllib.parse.urlencode({"q": sys.stdin.read()}).encode()
req = urllib.request.Request("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t", data=data, headers={"User-Agent": "Mozilla/5.0"})
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        print(r.read().decode())
except Exception as e:
    sys.exit(1)
`;
      const child = execFile("python3", ["-c", pythonScript]);
      if (child.stdin) {
        child.stdin.write(textToTranslate);
        child.stdin.end();
      }
      const pyRes = await new Promise<string>((resolve, reject) => {
        let out = "";
        child.stdout?.on("data", (d) => (out += d));
        child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error("Python fallback failed"))));
      });
      stdout = pyRes;
    }

    let finalResult = new Array<string>(lines.length).fill("");
    let sourceLang = "en";

    try {
      const data = JSON.parse(stdout);
      const translatedCombined: string = data[0].map((chunk: [string, ...unknown[]]) => chunk[0]).join("");
      const translatedLines = translatedCombined.split("\n");
      sourceLang = data[2] || "en";

      nonEmptyItems.forEach((item, i) => {
        finalResult[item.idx] = (translatedLines[i] || "").trim();
      });
    } catch {
      // Tier 3 Fallback: MyMemory Translation API if Google blocks or returns unexpected format
      console.warn("[API /lyrics/translate] Google translate failed, activating MyMemory fallback...");
      try {
        const myMemoryPromises = nonEmptyItems.map(async (item) => {
          const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(item.text)}&langpair=en|${encodeURIComponent(targetLang)}`;
          const r = await fetch(u, { signal: AbortSignal.timeout(5000) });
          if (r.ok) {
            const j = await r.json();
            return { idx: item.idx, text: j.responseData?.translatedText || item.text };
          }
          return { idx: item.idx, text: item.text };
        });
        const resolved = await Promise.all(myMemoryPromises);
        resolved.forEach((item) => {
          finalResult[item.idx] = item.text;
        });
        sourceLang = "en";
      } catch (myMemErr) {
        console.error("[API /lyrics/translate] MyMemory fallback also failed:", myMemErr);
        throw new Error("All translation engines failed");
      }
    }

    const responsePayload = {
      translated: finalResult,
      sourceLang,
    };

    // Keep cache size bounded to 500 entries
    if (translationCache.size > 500) {
      const oldestKey = translationCache.keys().next().value;
      if (oldestKey) translationCache.delete(oldestKey);
    }
    translationCache.set(cacheKey, responsePayload);

    return NextResponse.json(responsePayload);
  } catch (err) {
    console.error("[API /lyrics/translate]", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
