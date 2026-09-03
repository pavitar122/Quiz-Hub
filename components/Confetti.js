"use client";
import { useEffect, useMemo } from "react";
import { playCelebrationSound } from "@/lib/sound";

const COLORS = ["var(--accent)", "var(--accent2)", "var(--correct)", "var(--star)"];

export default function Confetti({ count = 60, sound = true }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.4,
    duration: 1.8 + Math.random() * 1.2,
    color: COLORS[i % COLORS.length],
    rotate: Math.random() * 360,
    drift: (Math.random() - 0.5) * 60,
  })), [count]);

  useEffect(() => {
    if (sound) playCelebrationSound();
  }, [sound]);

  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map(p => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left + "%",
            background: p.color,
            animationDelay: p.delay + "s",
            animationDuration: p.duration + "s",
            transform: `rotate(${p.rotate}deg) translateX(${p.drift}px)`,
          }}
        />
      ))}
    </div>
  );
}