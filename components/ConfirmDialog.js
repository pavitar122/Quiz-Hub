"use client";
import { useEffect, useRef } from "react";

export default function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger = true, busy = false, onConfirm, onCancel }) {
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    btnRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div id="confirm-title" className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="btn-row end">
          <button className="btn small ghost" onClick={onCancel}>Cancel</button>
          <button
            ref={btnRef}
            className={`btn small ${danger ? "danger" : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <span className="spinner"></span> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
