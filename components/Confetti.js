"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { playCelebrationSound } from "@/lib/sound";

const COLORS = ["var(--accent)", "var(--accent2)", "var(--correct)", "var(--star)", "var(--ink-deep)"];
const SHAPES = ["rect", "circle", "diamond", "strip"];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export default function Confetti({ count = 84, sound = true }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Confetti rain pieces — elegant top-down fall
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const base = rand(6, 12);
    const isStrip = shape === "strip";
    const isDiamond = shape === "diamond";
    return {
      id: i,
      shape,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      left: rand(-2, 102).toFixed(2),
      width: isStrip ? rand(4, 6) : isDiamond ? base * 0.95 : base * 0.8,
      height: isStrip ? rand(14, 22) : isDiamond ? base * 0.95 : base * 1.35,
      duration: rand(3.2, 5.4),
      delay: rand(0, 1.1),
      sway: rand(-55, 55).toFixed(1),
      rot: rand(360, 900).toFixed(0),
      rot2: rand(-220, 220).toFixed(0),
      blur: Math.random() < 0.18 ? 0.4 : 0,
    };
  }), [count]);

  // Fireworks — 3 bursts staggered
  const fireworks = useMemo(() => [
    { id: 0, left: 22, top: 28, delay: 0.25, scale: 1, hue: "var(--accent)" },
    { id: 1, left: 50, top: 18, delay: 0.62, scale: 1.15, hue: "var(--accent2)" },
    { id: 2, left: 78, top: 30, delay: 0.92, scale: 0.95, hue: "var(--star)" },
  ], []);

  // Sparkles — lightweight twinkles
  const sparkles = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: rand(8, 92).toFixed(1),
    top: rand(8, 58).toFixed(1),
    delay: rand(0, 1.4).toFixed(2),
    size: rand(3, 7).toFixed(1),
    dur: rand(1.2, 2.1).toFixed(2),
  })), []);

  useEffect(() => {
    if (sound) playCelebrationSound();
  }, [sound]);

  if (!mounted) return null;

  return createPortal(
    <div className="celebration-layer" aria-hidden="true">
      {/* soft ambient glow behind content */}
      <div className="celebration-glow" />
      <div className="celebration-glow second" />
      {/* expanding rings */}
      <div className="celebration-rings">
        <span className="ring r1" />
        <span className="ring r2" />
        <span className="ring r3" />
      </div>

      {/* fireworks bursts */}
      <div className="fireworks">
        {fireworks.map(fw => (
          <div
            key={fw.id}
            className="firework"
            style={{
              left: fw.left + "%",
              top: fw.top + "%",
              "--fw-delay": fw.delay + "s",
              "--fw-scale": fw.scale,
              color: fw.hue,
            }}
          >
            <span className="firework-core" />
            <span className="firework-flash" />
            {Array.from({ length: 14 }, (_, j) => {
              const angle = (j * 360) / 14;
              const dist = rand(38, 78);
              const col = COLORS[j % COLORS.length];
              return (
                <span
                  key={j}
                  className="spark"
                  style={{
                    "--angle": angle + "deg",
                    "--dist": dist + "px",
                    background: col,
                    animationDelay: (fw.delay + 0.02) + "s",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* twinkling stars */}
      <div className="celebration-stars">
        {sparkles.map(s => (
          <span
            key={s.id}
            className="cele-star"
            style={{
              left: s.left + "%",
              top: s.top + "%",
              width: s.size + "px",
              height: s.size + "px",
              animationDelay: s.delay + "s",
              animationDuration: s.dur + "s",
            }}
          />
        ))}
      </div>

      {/* elegant confetti rain */}
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
              "--rot2": p.rot2 + "deg",
              filter: p.blur ? `blur(${p.blur}px)` : undefined,
              opacity: 0.95,
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}
