// Speech formatting for Listen & Learn.
// Converts question content into natural, speakable text WITHOUT touching
// what the UI displays: symbols become words, units/abbreviations are
// expanded, and MCQ options are spoken as "Option A: …".
// The same formatter is used by the cloud TTS path and the browser
// SpeechSynthesis fallback so delivery is consistent.

// Long pauses are expressed as a token the player understands (cloud SSML
// converts it to <break/>, the fallback converts it to silence gaps).
export const PAUSE_SHORT = "\u2003"; // em-space = breath pause between sentences
export const PAUSE_MED = " … ";      // pause after a segment label
export const PAUSE_LONG = " — … ";   // pause before the next section

const SYMBOLS = [
  [/(\d)\s*%/g, "$1 percent"],
  [/(\d)\s*°\s*C\b/gi, "$1 degrees Celsius"],
  [/(\d)\s*°/g, "$1 degrees"],
  [/(\d)\s*÷\s*(\d)/g, "$1 divided by $2"],
  [/(\d)\s*×\s*(\d)/g, "$1 by $2"],
  [/(\d+)\s*:\s*(\d+(?:\s*:\s*\d+)*)/g, (m, a, b) => a + " is to " + String(b).split(":").map((s) => s.trim()).join(" is to ")], // ratios incl. mix chains: 1:2:3
  [/(\d+)\/(\d+)/g, "$1 by $2"],               // simple fractions
  [/≤/g, " less than or equal to "],
  [/≥/g, " greater than or equal to "],
  [/≈/g, " approximately equal to "],
  [/≠/g, " not equal to "],
  [/→|➜|⇒/g, " to "],
  [/&/g, " and "],
  [/\bπ\b/g, " pi "],
  [/₹/g, " rupees "],
  [/\+$/g, " plus"],
  [/\+/g, " plus "],
  [/=/g, " equals "],
  [/…/g, "..."],
  [/“|”|„/g, '"'],
  [/‘|’/g, "'"],
  [/\s*—\s*|\s*–\s*/g, ", "],                  // dashes → natural clause break
];

// Units — word-boundary aware so "mm" in a word is untouched. Order matters:
// compound units (per-area, squared, cubed) before plain units.
const UNITS = [
  [/(\d(?:\.\d+)?)\s*N\/mm\s*²?/g, "$1 newtons per square millimetre"],
  [/(\d(?:\.\d+)?)\s*(?:kN|KN)\/m²/g, "$1 kilonewtons per square metre"],
  [/(\d(?:\.\d+)?)\s*(?:kgf)\/cm²/g, "$1 kilograms force per square centimetre"],
  [/(\d(?:\.\d+)?)\s*(?:MPa|mpa)/g, "$1 megapascals"],
  [/(\d(?:\.\d+)?)\s*(?:kPa|kpa)/g, "$1 kilopascals"],
  [/(\d(?:\.\d+)?)\s*(?:kN|KN)/g, "$1 kilonewtons"],
  [/(\d(?:\.\d+)?)\s*(?:kN·m|kNm|KNm)/g, "$1 kilonewton metres"],
  [/(\d(?:\.\d+)?)\s*(?:kg\/m³|kg\/m3)/g, "$1 kilograms per cubic metre"],
  [/(\d(?:\.\d+)?)\s*m²/g, "$1 square metres"],
  [/(\d(?:\.\d+)?)\s*m³/g, "$1 cubic metres"],
  [/(\d(?:\.\d+)?)\s*mm²/g, "$1 square millimetres"],
  [/(\d(?:\.\d+)?)\s*(?:cum|CUm)\b/g, "$1 cubic metres"],
  [/(\d(?:\.\d+)?)\s*(?:sqm|SQM)\b/g, "$1 square metres"],
  [/(\d(?:\.\d+)?)\s*km\b/g, "$1 kilometres"],
  [/(\d(?:\.\d+)?)\s*cm\b/g, "$1 centimetres"],
  [/(\d(?:\.\d+)?)\s*mm\b/g, "$1 millimetres"],
  [/(\d(?:\.\d+)?)\s*m\b/g, "$1 metres"],
  [/(\d(?:\.\d+)?)\s*kg\b/g, "$1 kilograms"],
  [/(\d(?:\.\d+)?)\s*gm\b/g, "$1 grams"],
  [/(\d(?:\.\d+)?)\s*ml\b/g, "$1 millilitres"],
  [/(\d(?:\.\d+)?)\s*litres?\b/gi, "$1 litres"],
];

// Initialisms are spelled letter-by-letter so engines pronounce them
// correctly instead of guessing a word. Conservative civil-engineering list.
const INITIALISMS = /\b(RCC|PCC|RBC|WMM|GSB|DLC|DBC|TMT|PVC|CPVC|HDPE|GI|CP|OPC|PPC|BIS|IRC|IS|LHS|RHS|CW|WW|TW|GL|FFL|DD|BOD|COD|CFT|SFT|HVAP|HSD|CVC|LC|DBM|BC|WBM|MSE|TRC|AC|CC|PSC|ESR|STP|WTP|OHT|CRS|DPC|MLC)\b/g;

const WORD_EXPANSIONS = [
  [/\be\.g\.?,?\s/gi, "for example, "],
  [/\bi\.e\.?,?\s/gi, "that is, "],
  [/\betc\.?/gi, " et cetera"],
  [/\bviz\.?,?\s/gi, "namely, "],
  [/\bapprox\.?\s/gi, "approximately "],
  [/\bvs\.?\s/gi, "versus "],
  [/\bw\.r\.t\.?\s/gi, "with regard to "],
  [/\bNo\.\s/g, "Number "],
  [/\bNos\.\s/g, "Numbers "],
  [/\bFig\.\s/g, "Figure "],
  [/\bDia\.\s/g, "Diameter "],
  [/\bmax\.\s/gi, "maximum "],
  [/\bmin\.\s/gi, "minimum "],
];

function expandSymbols(text) {
  let t = text;
  UNITS.forEach(([re, rep]) => { t = t.replace(re, rep); });
  SYMBOLS.forEach(([re, rep]) => { t = t.replace(re, rep); });
  t = t.replace(INITIALISMS, (m) => m.split("").join(" "));
  WORD_EXPANSIONS.forEach(([re, rep]) => { t = t.replace(re, rep); });
  // collapse whitespace created by expansions
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

function clean(text) {
  return (text || "")
    .replace(/<[^>]+>/g, " ")            // strip stray markup
    .replace(/[*_`#]/g, " ")             // markdown decoration
    .replace(/\s*\n+\s*/g, ". ")         // line breaks → sentence breaks
    .replace(/\.{2,}/g, "...")
    .trim();
}

// Build the four spoken sections for one MCQ. Returns segments in play order;
// `gap` is the silence after the segment (ms) used by the fallback player.
export function getListenSegments(item, qIdx) {
  const q = item.q;
  const opts = q.options || [];
  const questionText = expandSymbols(clean(q.text));
  const optionText = opts
    .map((opt, i) => `Option ${String.fromCharCode(65 + i)}: ${expandSymbols(clean(opt))}.`)
    .join(" ");
  const correctText = opts[q.correct] != null
    ? `The correct answer is Option ${String.fromCharCode(65 + q.correct)}: ${expandSymbols(clean(opts[q.correct]))}.`
    : "";
  const explText = expandSymbols(clean(q.expl));

  return [
    { key: "question", label: "Question", text: `Question ${qIdx + 1}. ${questionText}`, gap: 300 },
    { key: "options",  label: "Options",  text: `Options. ${optionText}`, gap: 450 },
    { key: "answer",   label: "Answer",   text: `Answer. ${correctText}`, gap: 350 },
    { key: "expl",     label: "Explanation", text: `Explanation. ${explText}`, gap: 250 },
  ].filter((s) => s.text && s.text.replace(/[^a-zA-Z0-9]/g, "").length > 0);
}

// Split into sentences (used by the fallback engine for natural pacing and
// by the server to place SSML breaks). Keeps decimals/abbreviations intact
// by not splitting on a period followed by a digit or a single letter.
export function splitSentences(text) {
  const parts = text
    .replace(/([.!?])\s+(?=[A-Z0-9"'])/g, "$1\u0001")
    .split("\u0001")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}
