"use client";
import { useState } from "react";
import { useInstallPrompt } from "@/context/InstallPromptContext";
import Toast from "@/components/Toast";

export default function InstallButton({ variant = "nav", onInstalled }) {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);

  const flashToast = (msg) => {
    setToastMsg(msg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2200);
  };

  if (!canInstall) return null;

  const handleClick = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === "accepted") {
      flashToast("Installed — look for Quiz Hub on your home screen ✓");
      onInstalled && onInstalled();
    }
  };

  if (variant === "drawer") {
    return (
      <>
        <button className="install-btn install-btn--drawer" onClick={handleClick} disabled={busy}>
          <InstallIcon /> {busy ? "Installing…" : "Install App"}
        </button>
        <Toast message={toastMsg} show={toastShow} />
      </>
    );
  }

  return (
    <>
      <button className="install-btn" onClick={handleClick} disabled={busy} title="Install Quiz Hub as an app" aria-label="Install Quiz Hub as an app">
        <InstallIcon />
        <span>{busy ? "Installing…" : "Install App"}</span>
      </button>
      <Toast message={toastMsg} show={toastShow} />
    </>
  );
}

function InstallIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}
