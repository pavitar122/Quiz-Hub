"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

const SESSION_KEY = "qh-splash-shown";
const WORD = "QuizHub";
const HUB_START = 4; // "Quiz" white, "Hub" amber
const LETTER_BASE_DELAY = 0.55;
const LETTER_STAGGER = 0.05;

function isStandaloneLaunch() {
  if (typeof window === "undefined") return false;
  const byMedia = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  const byIOS = window.navigator.standalone === true;
  const byQuery = window.location.search.includes("source=pwa");
  return byMedia || byIOS || byQuery;
}

/**
 * Branded splash/launch animation for the installed PWA. Native OSes don't
 * give web apps a real animated splash screen (Android shows the manifest
 * icon on a solid color for a beat, iOS just shows white) — this recreates
 * that moment ourselves the instant the app boots from the home-screen
 * icon, then hands off to the real UI. Only fires once per app "session"
 * (sessionStorage), and only when actually launched standalone — a normal
 * browser tab never sees it.
 */
export default function SplashScreen() {
  const [phase, setPhase] = useState("hidden"); // hidden | in | out | done

  useEffect(() => {
    if (typeof window === "undefined") return;
    let alreadyShown = false;
    try { alreadyShown = sessionStorage.getItem(SESSION_KEY) === "1"; } catch {}
    if (alreadyShown || !isStandaloneLaunch()) { setPhase("done"); return; }

    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}

    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase("in");

    const holdMs = reduced ? 250 : 1500;
    const outMs = reduced ? 0 : 400;
    const t1 = setTimeout(() => setPhase("out"), holdMs);
    const t2 = setTimeout(() => setPhase("done"), holdMs + outMs);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === "hidden" || phase === "done") return null;

  return (
    <div className={`splash-screen ${phase === "out" ? "splash-screen--out" : ""}`} aria-hidden="true">
      <span className="splash-orb splash-orb--blue" />
      <span className="splash-orb splash-orb--purple" />
      <span className="splash-orb splash-orb--teal" />
      <div className="splash-stage">
        <div className="splash-halo" />
        <div className="splash-mark">
          <Image src="/icons/icon-512.png" alt="" width={124} height={124} priority />
        </div>
      </div>
      <div className="splash-word">
        {WORD.split("").map((ch, i) => (
          <span
            key={i}
            className={i >= HUB_START ? "splash-letter-hub" : ""}
            style={{ animationDelay: `${LETTER_BASE_DELAY + i * LETTER_STAGGER}s` }}
          >
            {ch}
          </span>
        ))}
      </div>
      <div className="splash-tag">Practice · Review · Master</div>
      <div className="splash-bar"><div /></div>
    </div>
  );
}
