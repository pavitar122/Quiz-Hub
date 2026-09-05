"use client";
import { useInstallPrompt } from "@/context/InstallPromptContext";

export default function IOSInstallHint() {
  const { showIOSHint, dismissIOSHint } = useInstallPrompt();
  if (!showIOSHint) return null;
  return (
    <div className="ios-install-hint" role="status">
      <span className="ios-install-hint-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /></svg>
      </span>
      <span className="ios-install-hint-text">Install Quiz Hub: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span>
      <button className="ios-install-hint-close" onClick={dismissIOSHint} aria-label="Dismiss install hint">×</button>
    </div>
  );
}
