"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const COLORS = ["var(--accent)", "var(--accent2)", "var(--correct)", "var(--star)", "var(--ink-deep)"];
const SHAPES = ["rect", "circle", "strip"];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Simple, lightweight confetti rain — no fireworks, rings, glow, or sound.
export default function Confetti({ count = 44 }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const isStrip = shape === "strip";
    const base = rand(6, 10);
    return {
      id: i,
      shape,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      left: rand(0, 100).toFixed(2),
      width: isStrip ? rand(4, 6) : base,
      height: isStrip ? rand(14, 20) : base,
      duration: rand(2.6, 3.8),
      delay: rand(0, 0.5),
      sway: rand(-24, 24).toFixed(1),
      rot: rand(220, 480).toFixed(0),
    };
  }), [count]);

  if (!mounted) return null;

  return createPortal(
    <div className="celebration-layer" aria-hidden="true">
      <div className="confetti-rain">
        {pieces.map(p => (
          <span
            key={p.id}
            className={`confetti-piece ${p.shape}`}
            style={{
              left: p.left + "%",
              width: p.width + "px",
              height: p.height + "px",
              background: p.color,
              animationDuration: p.duration + "s",
              animationDelay: p.delay + "s",
              "--sway": p.sway + "px",
              "--rot": p.rot + "deg",
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}
