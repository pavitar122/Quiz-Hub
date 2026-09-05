"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

// A slightly wider, warmer palette than the core UI chrome — this is a
// once-in-a-while celebratory moment, not everyday interface color, so it
// leans a little more playful than the strict engineering token set while
// still rhyming with it (blue primary, teal secondary, amber/gold accent).
const COLORS = [
  "var(--primary)", "var(--secondary)", "var(--accent)", "var(--success)",
  "#F472B6", "#A78BFA", "#38BDF8",
];
const SHAPES = ["rect", "circle", "strip", "star"];

function rand(min, max) {
  return min + Math.random() * (max - min);
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const FALL_DURATION = { min: 2.6, max: 4.4 };
const FALL_DELAY = { min: 0, max: 0.9 };

function makeRainPiece(i, delay) {
  const shape = pick(SHAPES);
  const isStrip = shape === "strip";
  const isStar = shape === "star";
  const base = rand(7, 13);
  return {
    id: "r" + i,
    shape,
    color: pick(COLORS),
    left: rand(0, 100).toFixed(2),
    width: isStrip ? rand(3, 5) : isStar ? rand(10, 15) : base,
    height: isStrip ? rand(14, 24) : isStar ? rand(10, 15) : base,
    duration: rand(FALL_DURATION.min, FALL_DURATION.max).toFixed(2),
    delay: (delay + rand(FALL_DELAY.min, FALL_DELAY.max)).toFixed(2),
    sway: rand(-34, 34).toFixed(1),
    rot: rand(220, 560).toFixed(0),
    gravity: rand(0.8, 1.5).toFixed(2),
  };
}

// Two handfuls of pieces "launched" from the bottom corners at the moment
// the result appears — arcs up and out before gravity pulls them back down,
// like a party popper. Purely transform/opacity, GPU friendly.
function makeBurstPiece(i, side, delay) {
  const shape = pick(SHAPES);
  const isStrip = shape === "strip";
  const isStar = shape === "star";
  const base = rand(7, 12);
  const spread = side === "left" ? rand(10, 92) : rand(8, 90);
  return {
    id: side + i,
    shape,
    color: pick(COLORS),
    originX: side === "left" ? rand(-2, 6) : rand(94, 102),
    travelX: side === "left" ? spread : -spread,
    peak: rand(46, 78).toFixed(0),
    width: isStrip ? rand(3, 5) : isStar ? rand(9, 13) : base,
    height: isStrip ? rand(12, 20) : isStar ? rand(9, 13) : base,
    duration: rand(1.5, 2.3).toFixed(2),
    delay: (delay + rand(0, 0.22)).toFixed(2),
    rot: rand(180, 480).toFixed(0),
  };
}

/**
 * Full-screen celebration confetti: a gentle top-down rain plus two corner
 * "party popper" bursts that fire on mount. `count` controls the rain
 * layer; the burst layer scales with it but stays capped so low-end
 * devices never render more than ~90 animated nodes at once.
 */
export default function Confetti({ count = 46, delay = 0.15 }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const rain = useMemo(
    () => Array.from({ length: count }, (_, i) => makeRainPiece(i, delay + 0.3)),
    [count, delay]
  );
  const burstCount = Math.min(22, Math.round(count * 0.4));
  const burst = useMemo(
    () => [
      ...Array.from({ length: burstCount }, (_, i) => makeBurstPiece(i, "left", delay)),
      ...Array.from({ length: burstCount }, (_, i) => makeBurstPiece(i, "right", delay)),
    ],
    [burstCount, delay]
  );

  if (!mounted) return null;

  return createPortal(
    <div className="celebration-layer" aria-hidden="true">
      <div className="celebration-flash" style={{ animationDelay: delay + "s" }} />
      <div className="confetti-rain">
        {rain.map((p) => (
          <span
            key={p.id}
            className={`confetti-piece ${p.shape}`}
            style={{
              left: p.left + "%",
              width: p.width + "px",
              height: p.height + "px",
              fontSize: p.shape === "star" ? p.width + "px" : undefined,
              background: p.shape === "star" ? "transparent" : p.color,
              color: p.color,
              animationDuration: p.duration + "s",
              animationDelay: p.delay + "s",
              "--sway": p.sway + "px",
              "--rot": p.rot + "deg",
              animationTimingFunction: `cubic-bezier(${p.gravity},${1 - p.gravity},0.3,1)`,
            }}
          />
        ))}
      </div>
      <div className="confetti-burst">
        {burst.map((p) => (
          <span
            key={p.id}
            className={`confetti-piece confetti-piece--burst ${p.shape}`}
            style={{
              left: p.originX + "%",
              width: p.width + "px",
              height: p.height + "px",
              fontSize: p.shape === "star" ? p.width + "px" : undefined,
              background: p.shape === "star" ? "transparent" : p.color,
              color: p.color,
              animationDuration: p.duration + "s",
              animationDelay: p.delay + "s",
              "--tx": p.travelX + "vw",
              "--peak": "-" + p.peak + "vh",
              "--rot": p.rot + "deg",
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}
