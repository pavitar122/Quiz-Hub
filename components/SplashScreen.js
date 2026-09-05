"use client";
import { useEffect, useState } from "react";

const SESSION_KEY = "qh-splash-shown";

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

    const holdMs = reduced ? 250 : 1150;
    const outMs = reduced ? 0 : 420;
    const t1 = setTimeout(() => setPhase("out"), holdMs);
    const t2 = setTimeout(() => setPhase("done"), holdMs + outMs);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === "hidden" || phase === "done") return null;

  return (
    <div className={`splash-screen ${phase === "out" ? "splash-screen--out" : ""}`} aria-hidden="true">
      <div className="splash-glow" />
      <div className="splash-mark">
        <svg viewBox="0 0 100 100" width="88" height="88" className="splash-mark-svg">
          <polygon className="splash-page splash-page-l" points="47,20 12,32 16,78 47,68" />
          <polygon className="splash-page splash-page-r" points="53,20 88,32 84,78 53,68" />
          <rect className="splash-spine" x="47" y="20" width="6" height="48" />
          <polyline className="splash-check" points="24,52 44,66 78,26" />
        </svg>
      </div>
      <div className="splash-word">
        <span>Quiz</span><span className="splash-word-accent">Hub</span>
      </div>
      <div className="splash-dots"><span /><span /><span /></div>
    </div>
  );
}
