"use client";
import { useEffect, useRef, useState } from "react";

// Animates from 0 (or its previous value) up to `value` whenever `value` changes.
// Renders as a plain span so it drops into existing markup (e.g. inside .num / .stat-chip .num).
export default function Counter({ value, duration = 700, suffix = "", className = "" }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const target = typeof value === "number" && !Number.isNaN(value) ? value : 0;
    const from = fromRef.current;
    if (from === target) { setDisplay(target); return; }
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    cancelAnimationFrame(rafRef.current);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = ease(t);
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={`count-up ${className}`}>{display}{suffix}</span>;
}
