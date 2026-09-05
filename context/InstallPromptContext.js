"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const InstallPromptContext = createContext(null);
const IOS_HINT_KEY = "qh-ios-install-hint-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  const byMedia = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  const byIOS = window.navigator.standalone === true;
  return !!(byMedia || byIOS);
}
function isIOSSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChromeLike = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOSDevice && webkit && notChromeLike;
}

/**
 * Wraps the app to capture Chrome/Edge/Android's `beforeinstallprompt`
 * event (fired once the manifest + service-worker installability criteria
 * are met) and expose a simple `promptInstall()` action, plus a flag for
 * the iOS Safari case — which never fires that event and needs a manual
 * "Share -> Add to Home Screen" nudge instead.
 */
export function InstallPromptProvider({ children }) {
  const [deferredEvent, setDeferredEvent] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [iosHintDismissed, setIosHintDismissed] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    try { setIosHintDismissed(localStorage.getItem(IOS_HINT_KEY) === "1"); } catch {}
    setReady(true);

    const onBeforeInstall = (e) => { e.preventDefault(); setDeferredEvent(e); };
    const onInstalled = () => { setInstalled(true); setDeferredEvent(null); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredEvent) return "unavailable";
    deferredEvent.prompt();
    try {
      const choice = await deferredEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferredEvent(null);
      return choice.outcome;
    } catch {
      setDeferredEvent(null);
      return "dismissed";
    }
  }, [deferredEvent]);

  const dismissIOSHint = useCallback(() => {
    setIosHintDismissed(true);
    try { localStorage.setItem(IOS_HINT_KEY, "1"); } catch {}
  }, []);

  const value = {
    ready,
    installed,
    canInstall: ready && !installed && !!deferredEvent,
    showIOSHint: ready && !installed && !deferredEvent && !iosHintDismissed && isIOSSafari(),
    promptInstall,
    dismissIOSHint,
  };

  return <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>;
}

export function useInstallPrompt() {
  const ctx = useContext(InstallPromptContext);
  // Outside the provider (or during a stray render), fail soft instead of
  // throwing — every consumer here is decorative UI, never critical path.
  return ctx || { ready: false, installed: true, canInstall: false, showIOSHint: false, promptInstall: async () => "unavailable", dismissIOSHint: () => {} };
}
