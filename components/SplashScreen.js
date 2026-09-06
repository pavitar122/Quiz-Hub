"use client";
import { useEffect, useState } from "react";

// Shows a brief native-style launch splash ONLY when the app is opened as an
// installed PWA (i.e. tapped from the Android home screen icon / TWA, or
// iOS "Add to Home Screen"). Regular browser-tab visits skip this entirely —
// nobody wants a splash screen every time they refresh a browser tab.
//
// Detection covers:
//  - display-mode: standalone / window-controls-overlay  (Android/desktop PWA)
//  - navigator.standalone                                (iOS home-screen)
//  - document.referrer starting with android-app://       (Android TWA/Trusted Web Activity)
export default function SplashScreen() {
  const [phase, setPhase] = useState("idle"); // idle -> visible -> leaving -> gone

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
      window.navigator?.standalone === true ||
      document.referrer?.startsWith("android-app://");

    if (!isStandalone) return;

    // sessionStorage guard: only play once per app session (e.g. avoids a
    // replay if a client-side error boundary forces a soft remount).
    if (sessionStorage.getItem("qh-splash-shown") === "1") return;
    sessionStorage.setItem("qh-splash-shown", "1");

    setPhase("visible");
    const leaveTimer = setTimeout(() => setPhase("leaving"), 900);
    const goneTimer = setTimeout(() => setPhase("gone"), 1250);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(goneTimer);
    };
  }, []);

  if (phase === "idle" || phase === "gone") return null;

  return (
    <div className={`splash-overlay ${phase === "leaving" ? "leaving" : ""}`} aria-hidden="true">
      <div className="splash-mark">
        <img src="/icons/icon-192.png" alt="" width={84} height={84} className="splash-icon" />
        <div className="splash-word display">QUIZ HUB</div>
        <div className="splash-sub mono">CIVIL ENGINEERING PRACTICE</div>
      </div>
      <div className="splash-bar"><div className="splash-bar-fill"></div></div>
    </div>
  );
}
