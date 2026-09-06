"use client";

const STORAGE_KEY = "qh_progress_v1";

const DEFAULT_PROGRESS = {
  bestScores: {},
  attemptCounts: {},
  bookmarks: {},
  missCounts: {},
  stats: {
    totalAnswered: 0,
    totalCorrect: 0,
    streak: 0,
    bestStreak: 0,
    sessionsCompleted: 0,
  },
};

export function getLocalProgress() {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw);
    return {
      bestScores: parsed.bestScores || {},
      attemptCounts: parsed.attemptCounts || {},
      bookmarks: parsed.bookmarks || {},
      missCounts: parsed.missCounts || {},
      stats: {
        totalAnswered: parsed.stats?.totalAnswered || 0,
        totalCorrect: parsed.stats?.totalCorrect || 0,
        streak: parsed.stats?.streak || 0,
        bestStreak: parsed.stats?.bestStreak || 0,
        sessionsCompleted: parsed.stats?.sessionsCompleted || 0,
      },
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function saveLocalProgress(prog) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prog));
  } catch {}
}

export function recordLocalAnswer(catId, subIdx, num, correct) {
  const prog = getLocalProgress();
  const key = `${subIdx}-${num}`;
  prog.stats.totalAnswered++;
  if (correct) {
    prog.stats.totalCorrect++;
    prog.stats.streak++;
    if (prog.stats.streak > prog.stats.bestStreak) {
      prog.stats.bestStreak = prog.stats.streak;
    }
  } else {
    prog.stats.streak = 0;
    if (!prog.missCounts[catId]) prog.missCounts[catId] = {};
    prog.missCounts[catId][key] = (prog.missCounts[catId][key] || 0) + 1;
  }
  saveLocalProgress(prog);
  return prog;
}

export function toggleLocalBookmark(catId, subIdx, num) {
  const prog = getLocalProgress();
  const key = `${subIdx}-${num}`;
  if (!prog.bookmarks[catId]) prog.bookmarks[catId] = [];
  const idx = prog.bookmarks[catId].indexOf(key);
  let isBookmarked = false;
  if (idx === -1) {
    prog.bookmarks[catId].push(key);
    isBookmarked = true;
  } else {
    prog.bookmarks[catId].splice(idx, 1);
    isBookmarked = false;
  }
  saveLocalProgress(prog);
  return { prog, isBookmarked };
}

export function recordLocalComplete(catId, kind, score, total) {
  const prog = getLocalProgress();
  if (!prog.bestScores[catId]) prog.bestScores[catId] = {};
  const pct = Math.round((score / total) * 100);
  const prev = prog.bestScores[catId][kind];
  if (!prev || pct > prev.pct) {
    prog.bestScores[catId][kind] = { correct: score, total, pct, date: Date.now() };
  }
  if (!prog.attemptCounts[catId]) prog.attemptCounts[catId] = {};
  prog.attemptCounts[catId][kind] = (prog.attemptCounts[catId][kind] || 0) + 1;
  prog.stats.sessionsCompleted++;
  saveLocalProgress(prog);
  return prog;
}

export function recordLocalPracticeComplete() {
  const prog = getLocalProgress();
  prog.stats.sessionsCompleted++;
  saveLocalProgress(prog);
  return prog;
}
