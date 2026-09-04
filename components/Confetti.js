"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const COLORS = ["var(--accent)", "var(--accent2)", "var(--correct)", "var(--star)", "var(--ink-deep)"];
const SHAPES = ["rect", "circle", "strip"];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

const FALL_DURATION = { min: 2.6, max: 4.2 };
const FALL_DELAY = { min: 0, max: 0.8 };

// Enhanced confetti with staggered starts, varied shapes, and gravity simulation
export default function Confetti({ count = 44, delay = 0.4 }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const isStrip = shape === "strip";
    const base = rand(6, 12);
    return {
      id: i,
      shape,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      left: rand(0, 100).toFixed(2),
      width: isStrip ? rand(3, 5) : base,
      height: isStrip ? rand(14, 22) : base,
      duration: rand(FALL_DURATION.min, FALL_DURATION.max).toFixed(1),
      delay: delay + rand(FALL_DELAY.min, FALL_DELAY.max).toFixed(1),
      sway: rand(-30, 30).toFixed(1),
      rot: rand(200, 520).toFixed(0),
      gravity: rand(0.8, 1.5).toFixed(1),
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
              animationTimingFunction: `cubic-bezier(${p.gravity},${1 - p.gravity},0.3,1)`,
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}
