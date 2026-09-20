// Server-side Text-to-Speech for Listen & Learn.
//
// Why a cloud provider: browser SpeechSynthesis voices are device- and
// OS-dependent, so Android Chrome and desktop Chrome never sound alike.
// Routing every request through one provider with fixed voice identifiers
// gives the exact same two Indian English voices everywhere.
//
// Provider abstraction: add an entry to PROVIDERS + VOICES to support a new
// vendor; nothing else in the app changes. The first provider whose
// environment variables are present wins (Azure preferred for its strong
// en-IN neural voices).
//
// Caching: audio is cached on disk (keyed by provider+voice+text hash) and in
// a small in-process hot map, so repeated playback of the same question never
// re-hits the provider API — that keeps costs near zero for revision use.

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

// Two selectable voices, identified by gender. IDs per provider below.
export const VOICE_IDS = ["female", "male"];

const VOICES = {
  azure: {
    female: { id: "en-IN-NeerjaNeural", label: "Indian English — Female" },
    male:   { id: "en-IN-PrabhatNeural", label: "Indian English — Male" },
  },
  google: {
    female: { id: "en-IN-Neural2-C", label: "Indian English — Female" },
    male:   { id: "en-IN-Neural2-B", label: "Indian English — Male" },
  },
};

function activeProvider() {
  if (process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION) return "azure";
  if (process.env.GOOGLE_TTS_API_KEY) return "google";
  return null;
}

// What the client probes once per session. Never exposes keys.
export function getProviderInfo() {
  const provider = activeProvider();
  return {
    provider,
    voices: provider
      ? {
          female: { id: VOICES[provider].female.id, label: VOICES[provider].female.label },
          male:   { id: VOICES[provider].male.id, label: VOICES[provider].male.label },
        }
      : null,
  };
}

// ---------- SSML ----------
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Natural pacing: insert a short break between sentences and a longer one
// after section labels ("Options.", "Answer.", "Explanation.").
function buildSsml(text) {
  const sentences = text
    .replace(/([.!?])\s+(?=[A-Z0-9"'])/g, "$1\u0001")
    .split("\u0001")
    .map((s) => s.trim())
    .filter(Boolean);
  const withBreaks = sentences
    .map((s) => {
      const labelled = /^(Options|Answer|Explanation|Question)\./.test(s)
        ? `<break time="500ms"/>${s}`
        : s;
      return `<s>${labelled}</s>`;
    })
    .join('<break time="380ms"/>');
  return `<speak>${withBreaks}</speak>`;
}

// ---------- File + memory cache ----------
const CACHE_DIR = path.join(process.cwd(), ".tts-cache");
const MAX_CACHE_FILES = 4000;
const memCache = new Map(); // key -> Buffer
const MEM_CACHE_MAX = 40;

function cacheKey(provider, voiceId, text) {
  return crypto.createHash("sha1").update(`${provider}|${voiceId}|${text}`).digest("hex");
}

async function readCache(key) {
  const hit = memCache.get(key);
  if (hit) return hit;
  try {
    const buf = await fs.readFile(path.join(CACHE_DIR, key + ".mp3"));
    memSet(key, buf);
    return buf;
  } catch {
    return null;
  }
}

function memSet(key, buf) {
  if (memCache.size >= MEM_CACHE_MAX) {
    const first = memCache.keys().next().value;
    memCache.delete(first);
  }
  memCache.set(key, buf);
}

async function writeCache(key, buf) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, key + ".mp3"), buf);
    memSet(key, buf);
    pruneCache();
  } catch {
    /* cache write is best-effort; never fail the request over it */
  }
}

let pruning = false;
async function pruneCache() {
  if (pruning) return;
  pruning = true;
  try {
    const files = await fs.readdir(CACHE_DIR);
    if (files.length <= MAX_CACHE_FILES) return;
    const stats = await Promise.all(
      files.map(async (f) => {
        const st = await fs.stat(path.join(CACHE_DIR, f)).catch(() => null);
        return st ? { f, m: st.mtimeMs } : null;
      })
    );
    const valid = stats.filter(Boolean).sort((a, b) => a.m - b.m);
    const excess = valid.length - MAX_CACHE_FILES;
    for (let i = 0; i < excess; i++) {
      await fs.unlink(path.join(CACHE_DIR, valid[i].f)).catch(() => {});
    }
  } catch {
    /* ignore */
  } finally {
    pruning = false;
  }
}

// ---------- Providers ----------
async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function synthesizeAzure(text, voiceId) {
  const key = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION;
  const ssml = `<speak><voice name="${voiceId}">${buildSsml(text)}</voice></speak>`;
  const res = await fetchWithTimeout(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "QuizHub",
      },
      body: ssml,
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Azure TTS ${res.status}: ${detail.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function synthesizeGoogle(text, voiceId) {
  const key = process.env.GOOGLE_TTS_API_KEY;
  const res = await fetchWithTimeout(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { ssml: buildSsml(text) },
        voice: { languageCode: "en-IN", name: voiceId },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1 },
      }),
    }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.audioContent) {
    throw new Error(`Google TTS ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return Buffer.from(data.audioContent, "base64");
}

// ---------- Public API ----------
// Returns { buffer, cacheHit } or null when no provider is configured
// (the client then falls back to the browser speech engine).
export async function synthesize({ text, voice }) {
  const provider = activeProvider();
  if (!provider || !VOICE_IDS.includes(voice)) return null;

  const voiceId = VOICES[provider][voice].id;
  const key = cacheKey(provider, voiceId, text);

  const cached = await readCache(key);
  if (cached) return { buffer: cached, cacheHit: true };

  const buffer =
    provider === "azure" ? await synthesizeAzure(text, voiceId) : await synthesizeGoogle(text, voiceId);
  if (!buffer || buffer.length === 0) throw new Error("Empty audio from provider");

  writeCache(key, buffer);
  return { buffer, cacheHit: false };
}
