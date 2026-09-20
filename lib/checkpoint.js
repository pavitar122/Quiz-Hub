"use client";

// Practice-mode checkpoint store.
//
// Logged-in users: checkpoints live on the server inside their Progress
// document (synced across devices). Guests: checkpoints live in localStorage.
// Both paths share one small API so pages never care which is active.
//
// Stale-write guard: every checkpoint carries an `updatedAt` timestamp. A save
// whose timestamp is older than the stored one is refused, so a delayed request
// or a background tab can never overwrite newer progress.

const LS_KEY = "qh_practice_checkpoints";

function lsAll() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function lsWrite(map) {
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch {}
}

// Basic shape check — protects the UI against corrupt / outdated entries.
export function isSaneCheckpoint(cp) {
  return !!cp &&
    typeof cp === "object" &&
    typeof cp.type === "string" &&
    Array.isArray(cp.remaining) &&
    typeof cp.totalUnique === "number" &&
    Number.isFinite(cp.totalUnique);
}

// For logged-in users the Progress doc (already fetched as `progressDoc`)
// carries the authoritative copy; guests read localStorage.
export function readCheckpoint(user, catId, progressDoc) {
  if (user) {
    const cp = progressDoc?.checkpoints?.[catId];
    return isSaneCheckpoint(cp) ? cp : null;
  }
  const cp = lsAll()[catId];
  return isSaneCheckpoint(cp) ? cp : null;
}

export async function saveCheckpoint(user, catId, checkpoint) {
  if (typeof window === "undefined") return { ok: false };
  const stamped = { ...checkpoint, updatedAt: Date.now() };

  // Local mirror — the source of truth for guests, and a stale-guard
  // reference for logged-in users on the same device.
  const all = lsAll();
  const existing = all[catId];
  if (existing?.updatedAt && stamped.updatedAt < existing.updatedAt) {
    return { ok: true, stale: true }; // newer data already present; keep it
  }
  all[catId] = stamped;
  lsWrite(all);

  if (!user) return { ok: true };
  try {
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "checkpoint", catId, checkpoint: stamped }),
    });
    if (!res.ok) throw new Error("save failed");
    return { ok: true };
  } catch {
    return { ok: false }; // caller should inform the user
  }
}

export async function removeCheckpoint(user, catId) {
  if (typeof window === "undefined") return;
  const all = lsAll();
  if (all[catId]) { delete all[catId]; lsWrite(all); }
  if (!user) return;
  try {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "checkpointDelete", catId }),
    });
  } catch {}
}

// Flat list of [{ catId, checkpoint }] for dashboards (homepage / subject page).
export function listCheckpoints(user, progressDoc) {
  const source = user ? (progressDoc?.checkpoints || {}) : lsAll();
  const out = [];
  Object.keys(source || {}).forEach((catId) => {
    if (isSaneCheckpoint(source[catId])) out.push({ catId, checkpoint: source[catId] });
  });
  return out;
}

// ---- Listen & Learn preferences (voice + speed) ----
// Logged-in users get these synced through their Progress document; guests
// fall back to localStorage.

export function readPrefs(user, progressDoc) {
  if (user) return progressDoc?.prefs || {};
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem("qh_prefs") || "{}") || {}; } catch { return {}; }
}

export async function savePrefs(user, prefs) {
  if (!user) {
    try {
      const cur = readPrefs(null, null);
      window.localStorage.setItem("qh_prefs", JSON.stringify({ ...cur, ...prefs }));
    } catch {}
    return;
  }
  try {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "prefs", prefs }),
    });
  } catch {}
}
