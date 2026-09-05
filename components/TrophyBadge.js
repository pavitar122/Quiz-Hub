"use client";

// Tiered celebration medal shown at the top of a passed quiz result.
// tier: "gold" (>=90%), "silver" (>=80%), "bronze" (>=70%)
const TIER_META = {
  gold: { emoji: "🏆", label: "Outstanding", ring: "var(--accent)" },
  silver: { emoji: "🥈", label: "Great Work", ring: "var(--primary)" },
  bronze: { emoji: "🥉", label: "Well Done", ring: "var(--secondary)" },
};

export default function TrophyBadge({ tier = "bronze" }) {
  const meta = TIER_META[tier] || TIER_META.bronze;
  return (
    <div className={`trophy-wrap trophy-${tier}`} style={{ "--ring-color": meta.ring }}>
      <span className="trophy-ring trophy-ring-1" />
      <span className="trophy-ring trophy-ring-2" />
      <span className="trophy-ring trophy-ring-3" />
      <span className="trophy-medal">
        <span className="trophy-medal-shine" />
        <span className="trophy-emoji" role="img" aria-label={meta.label}>{meta.emoji}</span>
      </span>
      <span className="trophy-sparkle s1">✦</span>
      <span className="trophy-sparkle s2">✧</span>
      <span className="trophy-sparkle s3">✦</span>
      <span className="trophy-sparkle s4">✧</span>
    </div>
  );
}
