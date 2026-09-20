// Generates a short, typographic monogram from a title — used in place of
// emoji icons across subject cards, tabs and lists. e.g. "Building Construction" -> "BC"
export function monogram(title) {
  if (!title) return "—";
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "—";
}
