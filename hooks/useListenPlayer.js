"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getListenSegments } from "@/lib/speech-format";

// Listen & Learn playback engine.
//
// Cloud mode (a TTS provider is configured server-side): every section is
// fetched from /api/tts as immutable MP3 (browser + server caches make
// repeats free) and played through HTMLAudioElement — identical voices on
// every device, reliable pause/resume, no 15-second Chrome cutoffs.
//
// Fallback mode (no provider configured): the browser SpeechSynthesis engine
// pinned to the two best available Indian-English device voices, with the
// hardened cancel/resume pipeline (heartbeat, intentional-cancel handling).
//
// Concurrency model: every user action bumps runIdRef, invalidating any
// in-flight async chain from the previous action; intentRef tracks whether
// playback is wanted right now (so gap timers die on pause/stop).

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const CLOUD_AUDIO_CACHE_MAX = 150;

// ---- module-level cloud audio cache (survives navigation within a session) ----
const audioUrlCache = new Map(); // "voice|text" -> objectURL
const audioInFlight = new Map(); // "voice|text" -> Promise<objectURL>

function cacheObjectUrl(key, url) {
  if (audioUrlCache.size >= CLOUD_AUDIO_CACHE_MAX) {
    const first = audioUrlCache.keys().next().value;
    const old = audioUrlCache.get(first);
    audioUrlCache.delete(first);
    if (old) URL.revokeObjectURL(old);
  }
  audioUrlCache.set(key, url);
}

async function loadSegmentAudio(text, voice) {
  const key = `${voice}|${text}`;
  const hit = audioUrlCache.get(key);
  if (hit) return hit;
  if (audioInFlight.has(key)) return audioInFlight.get(key);

  const p = (async () => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    const ctype = res.headers.get("Content-Type") || "";
    if (ctype.includes("application/json")) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data?.error || "No cloud voice provider configured");
      // Only a "no provider configured" response (X-TTS-Fallback) silently
      // degrades to device voices; provider failures (5xx/4xx) surface as
      // retryable errors instead.
      err.fallback = res.headers.get("X-TTS-Fallback") === "1";
      if (!err.fallback) err.isUserFacing = true;
      throw err;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Speech service error (${res.status})`);
    }
    const url = URL.createObjectURL(await res.blob());
    cacheObjectUrl(key, url);
    return url;
  })().finally(() => audioInFlight.delete(key));

  audioInFlight.set(key, p);
  return p;
}

// ---- SpeechSynthesis fallback: pin the two best Indian-English device voices ----
function curateFallbackVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return { female: null, male: null, any: null };
  const all = window.speechSynthesis.getVoices() || [];
  if (all.length === 0) return { female: null, male: null, any: null };
  const en = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length ? en : all;
  const score = (v) => {
    const s = `${v.name} ${v.voiceURI}`.toLowerCase();
    let sc = 0;
    if (v.lang.toLowerCase() === "en-in") sc += 10;
    else if (/india/.test(s)) sc += 8;
    else if (v.lang.toLowerCase() === "en-gb") sc += 3;
    else if (v.lang.toLowerCase() === "en-us") sc += 2;
    if (v.localService) sc += 1;
    return sc;
  };
  const femaleRe = /female|neerja|heera|kalpana|veena|priya|divya|deepa|aditi|isha|kajal|swara|raveena|ananya|lekha|woman|zira|aria|samantha/;
  const maleRe = /male|prabhat|madhur|hemant|ravi|rishi|arjun|rahul|vikram|david|mark|guy|daniel|george/;
  const females = pool.filter((v) => femaleRe.test(`${v.name} ${v.voiceURI}`.toLowerCase())).sort((a, b) => score(b) - score(a));
  const males = pool.filter((v) => maleRe.test(`${v.name} ${v.voiceURI}`.toLowerCase()) && !/female/.test(v.name.toLowerCase())).sort((a, b) => score(b) - score(a));
  const generic = pool.slice().sort((a, b) => score(b) - score(a));
  return {
    female: females[0] || generic[0] || null,
    male: males[0] || generic[0] || null,
    any: generic[0] || null,
  };
}

const PHASE_INDEX = { question: 0, options: 1, answer: 2, expl: 3 };

export function useListenPlayer({ queue, initialPrefs }) {
  const [provider, setProvider] = useState(undefined); // undefined = probing, null = fallback
  const [voice, setVoice] = useState(initialPrefs?.listenVoice === "male" ? "male" : "female");
  const [rate, setRateState] = useState(SPEEDS.includes(initialPrefs?.listenRate) ? initialPrefs.listenRate : 1);
  const [qIdx, setQIdx] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle|question|options|answer|expl
  const [status, setStatus] = useState("idle"); // idle|loading|playing|paused|finished|error
  const [error, setError] = useState(null);
  const [previewing, setPreviewing] = useState(null);

  const runIdRef = useRef(0);
  const intentRef = useRef(false);      // is playback wanted right now
  const modeRef = useRef("cloud");      // "cloud" | "fallback"
  const voiceRef = useRef(voice);
  const rateRef = useRef(rate);
  const queueRef = useRef(queue);
  const posRef = useRef({ q: 0, seg: 0 });        // what plays next
  const lastSegRef = useRef({ q: 0, seg: 0 });    // section currently being spoken
  const audioRef = useRef(null);
  const gapTimerRef = useRef(null);
  const midSegmentRef = useRef(false);  // paused mid-audio (cloud): resume continues it
  const heartbeatRef = useRef(null);
  const cancelledRef = useRef(false);
  const previewAudioRef = useRef(null);
  const fallbackVoicesRef = useRef({ female: null, male: null, any: null });

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { voiceRef.current = voice; }, [voice]);
  useEffect(() => { rateRef.current = rate; }, [rate]);

  // ---------- probe the server provider once ----------
  useEffect(() => {
    let alive = true;
    fetch("/api/tts")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        modeRef.current = d.provider ? "cloud" : "fallback";
        setProvider(d.provider || null);
      })
      .catch(() => {
        if (!alive) return;
        modeRef.current = "fallback";
        setProvider(null);
      });
    return () => { alive = false; };
  }, []);

  // ---------- fallback device voices ----------
  const loadFallbackVoices = useCallback(() => {
    fallbackVoicesRef.current = curateFallbackVoices();
  }, []);
  useEffect(() => {
    if (provider !== null) return; // only needed in fallback mode
    loadFallbackVoices();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = loadFallbackVoices;
      const t1 = setTimeout(loadFallbackVoices, 400);
      const t2 = setTimeout(loadFallbackVoices, 1200);
      return () => { clearTimeout(t1); clearTimeout(t2); window.speechSynthesis.onvoiceschanged = null; };
    }
  }, [provider, loadFallbackVoices]);

  // ---------- low-level cancellation ----------
  const clearGapTimer = () => {
    if (gapTimerRef.current) { clearTimeout(gapTimerRef.current); gapTimerRef.current = null; }
  };
  const stopHeartbeat = () => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
  };
  const startHeartbeat = () => {
    stopHeartbeat();
    // Chrome silently stops network SpeechSynthesis after ~15s; a pause+resume
    // poke keeps the engine alive for long option/explanation text.
    heartbeatRef.current = setInterval(() => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
      if (synth?.speaking && !synth.paused) {
        try { synth.pause(); synth.resume(); } catch {}
      }
    }, 12000);
  };
  const cancelAudioOnly = () => {
    const a = audioRef.current;
    if (a) { a.onended = null; a.onerror = null; a.pause(); }
    audioRef.current = null;
    midSegmentRef.current = false;
  };
  const cancelSynthOnly = () => {
    cancelledRef.current = true;
    stopHeartbeat();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  };
  const cancelAll = () => {
    runIdRef.current++;
    intentRef.current = false;
    clearGapTimer();
    cancelAudioOnly();
    cancelSynthOnly();
  };

  useEffect(() => {
    return () => {
      cancelAll();
      if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- core speaking chain ----------
  const playFrom = useCallback((q, seg, myRun) => {
    const list = queueRef.current;
    if (!list || list.length === 0) return;
    if (!intentRef.current || runIdRef.current !== myRun) return;

    if (q >= list.length) {
      intentRef.current = false;
      setPhase("idle");
      setStatus("finished");
      cancelAudioOnly();
      cancelSynthOnly();
      return;
    }
    const segs = getListenSegments(list[q], q);
    if (seg >= segs.length) {
      // question complete → short pause → auto-advance
      setPhase("idle");
      posRef.current = { q: q + 1, seg: 0 };
      clearGapTimer();
      gapTimerRef.current = setTimeout(() => playFrom(q + 1, 0, myRun), 600);
      return;
    }
    const segDef = segs[seg];
    posRef.current = { q, seg: seg + 1 };       // what comes after this section
    lastSegRef.current = { q, seg };            // what is speaking right now
    setQIdx(q);
    setPhase(segDef.key);
    setStatus("loading");

    const gapThenNext = () => {
      clearGapTimer();
      gapTimerRef.current = setTimeout(() => playFrom(q, seg + 1, myRun), segDef.gap);
    };

    if (modeRef.current === "cloud") {
      (async () => {
        try {
          const url = await loadSegmentAudio(segDef.text, voiceRef.current);
          if (runIdRef.current !== myRun || !intentRef.current) return;
          const a = new Audio(url);
          a.playbackRate = rateRef.current;
          a.onended = () => {
            if (runIdRef.current !== myRun || !intentRef.current) return;
            a.onended = null;
            gapThenNext();
          };
          a.onerror = () => {
            if (runIdRef.current !== myRun || !intentRef.current) return;
            setError("Audio playback failed. Tap Retry to try again.");
            setStatus("error");
          };
          audioRef.current = a;
          setStatus("playing");
          await a.play();
        } catch (e) {
          if (runIdRef.current !== myRun || !intentRef.current) return;
          if (e?.fallback) {
            // provider disappeared — degrade gracefully to device voices
            modeRef.current = "fallback";
            setProvider(null);
            playFrom(q, seg, myRun);
            return;
          }
          setError(e?.message || "Could not reach the speech service.");
          setStatus("error");
        }
      })();
      return;
    }

    // ---- fallback: SpeechSynthesis ----
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Speech is not supported in this browser.");
      setStatus("error");
      return;
    }
    cancelAudioOnly();
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(segDef.text);
    utter.rate = Math.min(2, Math.max(0.5, rateRef.current));
    const pinned = fallbackVoicesRef.current?.[voiceRef.current] || fallbackVoicesRef.current?.any;
    if (pinned) {
      utter.voice = pinned;
      utter.lang = pinned.lang || "en-IN";
      // subtle pitch shaping keeps the two options distinguishable even when
      // the device only exposes one underlying engine voice
      utter.pitch = voiceRef.current === "male" ? 0.9 : 1.05;
    } else {
      utter.lang = "en-IN";
    }
    utter.volume = 1;
    utter.onend = () => {
      stopHeartbeat();
      if (runIdRef.current !== myRun || !intentRef.current) return;
      gapThenNext();
    };
    utter.onerror = (ev) => {
      stopHeartbeat();
      if (runIdRef.current !== myRun || !intentRef.current) return;
      if (cancelledRef.current) return; // intentional stop/pause/skip
      const retryable = ["network", "synthesis-failed", "synthesis-unavailable", "voice-unavailable", "audio-busy"];
      if (retryable.includes(ev?.error)) {
        try { synth.cancel(); } catch {}
        const retryUtt = new SpeechSynthesisUtterance(segDef.text);
        retryUtt.rate = utter.rate;
        retryUtt.lang = "en-IN";
        retryUtt.onend = utter.onend;
        utter.onerror = utter.onerror;
        startHeartbeat();
        synth.speak(retryUtt);
      } else {
        setError("Device speech failed. Tap Retry to try again.");
        setStatus("error");
      }
    };
    setStatus("playing");
    // Chrome can drop a speak() immediately after cancel(); brief kickoff delay.
    setTimeout(() => {
      if (runIdRef.current !== myRun || !intentRef.current) return;
      startHeartbeat();
      synth.speak(utter);
    }, 130);
  }, []);

  const startPlaying = useCallback((q, seg) => {
    cancelAll();
    intentRef.current = true;
    const myRun = runIdRef.current;
    setStatus("loading");
    // brief defer so the previous cancel() teardown completes (Chrome quirk)
    setTimeout(() => {
      if (runIdRef.current !== myRun || !intentRef.current) return;
      playFrom(q, seg, myRun);
    }, 30);
  }, [playFrom]);

  // ---------- controls ----------
  const play = useCallback(() => {
    setError(null);
    if (status === "paused" && modeRef.current === "cloud" && midSegmentRef.current && audioRef.current) {
      // resume exactly where the audio paused
      runIdRef.current++;
      intentRef.current = true;
      const myRun = runIdRef.current;
      const a = audioRef.current;
      setStatus("playing");
      a.play().catch(() => startPlaying(posRef.current.q, posRef.current.seg));
      void myRun;
      return;
    }
    startPlaying(posRef.current.q, posRef.current.seg);
  }, [status, startPlaying]);

  const pause = useCallback(() => {
    if (!intentRef.current) return;
    runIdRef.current++;
    intentRef.current = false;
    clearGapTimer();
    const a = audioRef.current;
    if (modeRef.current === "cloud" && a && !a.paused && !a.ended) {
      a.onended = null;
      a.pause();
      midSegmentRef.current = true; // resume continues this audio
    } else {
      cancelAudioOnly();
      cancelSynthOnly();
      // fallback engine or paused inside a gap: replay the section that was speaking
      posRef.current = { ...lastSegRef.current };
    }
    setStatus("paused");
  }, []);

  const stop = useCallback(() => {
    cancelAll();
    const q = Math.min(posRef.current.q, (queueRef.current?.length || 1) - 1);
    posRef.current = { q, seg: 0 };
    lastSegRef.current = { q, seg: 0 };
    setQIdx(q);
    setPhase("idle");
    setStatus("idle");
    setError(null);
  }, []);

  const jumpTo = useCallback((target, { keepPlaying }) => {
    cancelAll();
    setError(null);
    const total = queueRef.current?.length || 0;
    if (target >= total) {
      setPhase("idle");
      setStatus("finished");
      return;
    }
    const t = Math.min(total - 1, Math.max(0, target));
    posRef.current = { q: t, seg: 0 };
    lastSegRef.current = { q: t, seg: 0 };
    setQIdx(t);
    setPhase("idle");
    if (keepPlaying) startPlaying(t, 0);
    else setStatus("idle");
  }, [startPlaying]);

  const goNext = useCallback(() => jumpTo(posRef.current.q + 1, { keepPlaying: intentRef.current }), [jumpTo]);
  const goPrev = useCallback(() => jumpTo(Math.max(0, posRef.current.q - 1), { keepPlaying: intentRef.current }), [jumpTo]);
  const seekQuestion = useCallback((target) => jumpTo(target, { keepPlaying: intentRef.current }), [jumpTo]);

  const replayQuestion = useCallback(() => {
    startPlaying(posRef.current.q, 0);
  }, [startPlaying]);

  const retry = useCallback(() => {
    setError(null);
    startPlaying(posRef.current.q, posRef.current.seg);
  }, [startPlaying]);

  // skip the failing section and move on
  const skipSection = useCallback(() => {
    setError(null);
    const current = posRef.current;
    startPlaying(current.q, current.seg + 1);
  }, [startPlaying]);

  const setRate = useCallback((r) => {
    setRateState(r);
    rateRef.current = r;
    // cloud audio: change pace instantly without refetching (cache-friendly)
    if (audioRef.current) audioRef.current.playbackRate = r;
    // fallback synth: restart the current section at the new rate
    if (modeRef.current === "fallback" && intentRef.current) {
      startPlaying(posRef.current.q, posRef.current.seg);
    }
  }, [startPlaying]);

  const chooseVoice = useCallback((v) => {
    if (v === voiceRef.current) return;
    setVoice(v);
    voiceRef.current = v;
    // restart the current section so the new voice is heard immediately
    if (intentRef.current) startPlaying(posRef.current.q, posRef.current.seg);
  }, [startPlaying]);

  const previewVoice = useCallback(async (v) => {
    setPreviewing(v);
    try {
      if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
      cancelSynthOnly();
      const sample = "Hello. This is your Indian English study voice. Let us begin the session.";
      if (modeRef.current === "cloud") {
        const url = await loadSegmentAudio(sample, v);
        const a = new Audio(url);
        previewAudioRef.current = a;
        a.onended = () => setPreviewing(null);
        await a.play();
      } else {
        const utter = new SpeechSynthesisUtterance(sample);
        const pinned = fallbackVoicesRef.current?.[v] || fallbackVoicesRef.current?.any;
        if (pinned) { utter.voice = pinned; utter.lang = pinned.lang; }
        else utter.lang = "en-IN";
        utter.pitch = v === "male" ? 0.9 : 1.05;
        utter.onend = () => setPreviewing(null);
        window.speechSynthesis.speak(utter);
      }
    } catch {
      setPreviewing(null);
    }
  }, []);

  const toggle = useCallback(() => {
    if (intentRef.current) pause();
    else if (status === "finished") {
      posRef.current = { q: 0, seg: 0 };
      startPlaying(0, 0);
    } else play();
  }, [status, pause, play, startPlaying]);

  return {
    provider, voice, rate, qIdx, phase, status, error,
    speeds: SPEEDS, previewing,
    finished: status === "finished",
    isPlaying: status === "playing" || status === "loading",
    toggle, play, pause, stop, goNext, goPrev, seekQuestion, replayQuestion, retry, skipSection,
    setRate, chooseVoice, previewVoice,
  };
}
