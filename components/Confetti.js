"use client";
import { useMemo } from "react";

const COLORS = ["var(--accent)", "var(--accent2)", "var(--correct)", "var(--star)"];
const SHAPES = ["rect", "circle", "triangle"];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export default function Confetti({ count = 90 }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    // Alternate the burst origin between the two bottom corners, like a
    // party popper going off on each side of the screen.
    const side = i % 2 === 0 ? -1 : 1;
    const originLeft = side === -1 ? rand(1, 12) : rand(88, 99);

    // Peak of the arc: shoots up and inward, then...
    const dx1 = side * rand(18, 42);
    const dy1 = -rand(38, 68);
    // ...gravity takes over and it drifts further sideways while falling.
    const dx2 = dx1 + side * rand(6, 18);
    const dy2 = rand(6, 24);

    const rot1 = rand(180, 420) * (Math.random() < 0.5 ? -1 : 1);
    const rot2 = rot1 + rand(200, 460) * (Math.random() < 0.5 ? -1 : 1);

    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const size = rand(6, 11);
    const isRect = shape === "rect";

    return {
      id: i,
      side,
      originLeft,
      shape,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      width: isRect ? size * 0.65 : size,
      height: isRect ? size * 1.5 : size,
      duration: rand(1.5, 2.3),
      delay: rand(0, 0.28),
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
