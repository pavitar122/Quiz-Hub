import { NextResponse } from "next/server";
import { synthesize, getProviderInfo, VOICE_IDS } from "@/lib/tts";

// Central, key-safe TTS endpoint. Browsers only ever see audio (or a
// {fallback:true} hint when no provider is configured) — credentials stay
// server-side. Audio responses are immutable, so the browser caches them
// across sessions too.

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getProviderInfo());
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body?.probe) return NextResponse.json(getProviderInfo());

  const { text, voice } = body || {};
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "text too long" }, { status: 413 });
  }
  if (!VOICE_IDS.includes(voice)) {
    return NextResponse.json({ error: "voice must be female or male" }, { status: 400 });
  }

  try {
    const result = await synthesize({ text, voice });
    if (!result) {
      // No provider configured — client falls back to the browser engine.
      return NextResponse.json(getProviderInfo(), { headers: { "X-TTS-Fallback": "1" } });
    }
    return new NextResponse(result.buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Cache": result.cacheHit ? "HIT" : "MISS",
      },
    });
  } catch (e) {
    console.error("TTS synthesis failed:", e.message);
    return NextResponse.json(
      { error: "Speech service unavailable. Please try again." },
      { status: 502 }
    );
  }
}
