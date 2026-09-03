"use client";
import { useEffect, useMemo } from "react";
import { playCelebrationSound } from "@/lib/sound";

const COLORS = ["var(--accent)", "var(--accent2)", "var(--correct)", "var(--star)"];
const SHAPES = ["rect", "circle", "triangle", "strip"];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export default function Confetti({ count = 130, sound = true }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    // Alternate the burst origin between the two bottom corners, like a
    // party popper going off on each side of the screen.
    const side = i % 2 === 0 ? -1 : 1;
    const originLeft = side === -1 ? rand(0, 8) : rand(92, 100);

    // Launch: shoots up and inward, reaching well past the middle of the
    // screen so the two bursts overlap and cover the full width/height.
    const dx1 = side * rand(28, 62);
    const dy1 = -rand(58, 96);
    // Gravity takes over: keeps drifting the same direction while falling
    // back down, well past the starting point.
    const dx2 = dx1 + side * rand(6, 22);
    const dy2 = rand(18, 42);

    const rot1 = rand(180, 460) * (Math.random() < 0.5 ? -1 : 1);
    const rot2 = rot1 + rand(220, 480) * (Math.random() < 0.5 ? -1 : 1);

    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const base = rand(6, 11);
    const isStrip = shape === "strip";
    const isTriangle = shape === "triangle";

    return {
      id: i,
      shape,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      width: isStrip ? base * 0.5 : isTriangle ? base * 1.15 : base * 0.75,
      height: isStrip ? base * 2.6 : isTriangle ? base * 1.15 : base * 1.4,
      duration: rand(2.3, 3.5),
      delay: rand(0, 0.3),
      style: {
        left: originLeft + "%",
        "--dx1": dx1.toFixed(1) + "vw",
        "--dy1": dy1.toFixed(1) + "vh",
        "--dx2": dx2.toFixed(1) + "vw",
        "--dy2": dy2.toFixed(1) + "vh",
        "--rot1": rot1.toFixed(0) + "deg",
        "--rot2": rot2.toFixed(0) + "deg",
      },
    };
  }), [count]);

  useEffect(() => {
    if (sound) playCelebrationSound();
  }, [sound]);

  return (
    <div className="confetti-layer" aria-hidden="true">
      <span className="confetti-flash left" />
      <span className="confetti-flash right" />
      {pieces.map(p => (
        <span
          key={p.id}
          className={`confetti-piece ${p.shape}`}
          style={{
            ...p.style,
            width: p.width + "px",
            height: p.height + "px",
            background: p.color,
            animationDuration: p.duration + "s",
            animationDelay: p.delay + "s",
          }}
        />
      ))}
    </div>
  );
}
