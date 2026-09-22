"use client";
import { Suspense, useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Confetti from "@/components/Confetti";
import Toast from "@/components/Toast";
import Counter from "@/components/Counter";
import { useAuth } from "@/context/AuthContext";
import {
  readCheckpoint, saveCheckpoint, removeCheckpoint, savePrefs, readPrefs,
} from "@/lib/checkpoint";
import { useListenPlayer } from "@/hooks/useListenPlayer";
import { getListenSegments } from "@/lib/speech-format";

export default function QuizPage() {
  // useSearchParams requires a Suspense boundary during prerendering.
  return (
    <Suspense fallback={<div className="loading-row"><span className="spinner"></span> Loading quiz…</div>}>
      <QuizInner />
    </Suspense>
  );
}

const itemKey = (item) => item.subIdx + "-" + item.q.num;
const SPEECH_UNSUPPORTED_MSG = "Speech not supported in this browser. Try Chrome, Edge or Safari on Android/iOS.";

function formatListenTime(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function estimateListenSeconds(queue, rate) {
  if (!queue?.length) return 0;
  const words = queue.reduce((sum, item, qIdx) => (
    sum + getListenSegments(item, qIdx).reduce((segmentWords, segment) => (
      segmentWords + segment.text.split(/\s+/).filter(Boolean).length
    ), 0)
  ), 0);
  const speechRate = 150 * Math.min(2, Math.max(0.5, rate || 1));
  const gaps = queue.reduce((sum, item, qIdx) => (
    sum + getListenSegments(item, qIdx).reduce((gapTotal, segment) => gapTotal + segment.gap, 0)
  ), 0);
  return (words / speechRate) * 60 + gaps / 1000;
}

function QuizInner() {
  const { id } = useParams();
  const sp = useSearchParams();
  const { user } = useAuth();
  const mode = sp.get("mode") || "test";
  const type = sp.get("type") || "full";
  const idx = sp.get("idx");
  const resumeNow = sp.get("resume") === "1";
  const [cat, setCat] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [progress, setProgress] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [resumeOffer, setResumeOffer] = useState(null); // { checkpoint } awaiting user choice
  const [savingNote, setSavingNote] = useState(null); // "saved" | "error" | null

  // ---- Listen & Learn state ----
  const [listenQueue, setListenQueue] = useState(null);
  const [listenIdx, setListenIdx] = useState(0);
  const [listenPhase, setListenPhase] = useState("idle"); // question | options | answer | expl
  const [isPlaying, setIsPlaying] = useState(false);
  const [listenFinished, setListenFinished] = useState(false);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);
  const utteranceRef = useRef(null);
  const timeoutRef = useRef(null);
  const isPlayingRef = useRef(false);
  const rateRef = useRef(1);
  const voiceRef = useRef(null);
  const selectedVoiceURIRef = useRef(""); // avoids re-subscribing voiceschanged on every selection
  const heartbeatRef = useRef(null); // keeps Chrome's TTS engine alive past its ~15s cutoff
  const cancelledRef = useRef(false); // distinguishes an intentional cancel() from a real onerror
  const resumeSegRef = useRef(0); // which segment (question/options/answer/expl) to resume from
  const wakeLockRef = useRef(null);
  const silentAudioRef = useRef(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(true);
  const [listenElapsed, setListenElapsed] = useState(0);
  const listenTimerStartRef = useRef(null);
  const listenElapsedRef = useRef(0);
  const listenObservedQuestionRef = useRef(-1);
  const listenObservedElapsedRef = useRef(0);

  const requestWakeLock = async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      setWakeLockSupported(false);
      return null;
    }
    try {
      const lock = await navigator.wakeLock.request("screen");
      wakeLockRef.current = lock;
      setWakeLockActive(true);
      lock.addEventListener("release", () => setWakeLockActive(false));
      return lock;
    } catch (e) {
      // NotAllowedError when battery saver / no user gesture / not visible
      setWakeLockSupported(false);
      return null;
    }
  };
  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); } catch {}
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };
  const startSilentKeepalive = () => {
    const a = silentAudioRef.current;
    if (!a) return;
    a.muted = false;
    a.volume = 0.01; // near-silent but keeps an audio session alive so Android doesn't suspend TTS when screen would dim
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  };
  const stopSilentKeepalive = () => {
    const a = silentAudioRef.current;
    if (!a) return;
    try { a.pause(); } catch {}
  };

  const quizRef = useRef(null);
  useEffect(() => { quizRef.current = quiz; }, [quiz]);

  // active question for the quiz UI (test follows order, practice follows its stream)
  const current = quiz ? (quiz.mode === "test" ? quiz.order[quiz.pos] : quiz.practiceCurrent) : null;

  // Listen & Learn engine — the hook is always mounted (hooks can't be
  // conditional); it only does work while the listen UI is active.
  const lp = useListenPlayer({ queue: listenQueue, initialPrefs: readPrefs(user, progress) });
  const listenEstimate = useMemo(
    () => {
      const theoretical = estimateListenSeconds(listenQueue, lp.rate);
      const completedQuestions = Math.max(0, lp.qIdx);
      const observedElapsed = listenObservedElapsedRef.current;
      if (!completedQuestions || !observedElapsed) return theoretical;
      return (observedElapsed / completedQuestions) * listenQueue.length;
    },
    [listenQueue, lp.rate, lp.qIdx, listenElapsed]
  );

  useEffect(() => {
    listenTimerStartRef.current = null;
    listenElapsedRef.current = 0;
    listenObservedQuestionRef.current = -1;
    listenObservedElapsedRef.current = 0;
    setListenElapsed(0);
  }, [listenQueue, mode]);

  useEffect(() => {
    if (mode !== "listen" || !listenQueue || lp.qIdx <= listenObservedQuestionRef.current) return;
    listenObservedQuestionRef.current = lp.qIdx;
    listenObservedElapsedRef.current = listenElapsedRef.current;
  }, [listenQueue, lp.qIdx, mode]);

  useEffect(() => {
    if (mode !== "listen" || !listenQueue) return undefined;
    if (lp.isPlaying) {
      if (listenTimerStartRef.current === null) listenTimerStartRef.current = Date.now();
      const timer = setInterval(() => {
        setListenElapsed(
          listenElapsedRef.current + (Date.now() - listenTimerStartRef.current) / 1000
        );
      }, 250);
      return () => clearInterval(timer);
    }
    if (listenTimerStartRef.current !== null) {
      listenElapsedRef.current += (Date.now() - listenTimerStartRef.current) / 1000;
      listenTimerStartRef.current = null;
      setListenElapsed(listenElapsedRef.current);
    }
    return undefined;
  }, [lp.isPlaying, listenQueue, mode]);

  useEffect(() => {
    if (mode !== "listen" || !listenQueue || !lp.finished) return;
    if (listenTimerStartRef.current !== null) {
      listenElapsedRef.current += (Date.now() - listenTimerStartRef.current) / 1000;
      listenTimerStartRef.current = null;
      setListenElapsed(listenElapsedRef.current);
    }
  }, [lp.finished, listenQueue, mode]);

  const flashToast = (msg) => {
    setToastMsg(msg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 1800);
  };

  // ================= Practice checkpoints =================
  const subIdxForCheckpoint = type === "sub" ? (Number.isNaN(parseInt(idx)) ? null : parseInt(idx)) : null;

  // Snapshot of an in-flight practice session, safe to persist + restore.
  // Sessions with zero answers never create checkpoints — there is nothing
  // meaningful to resume, and prompting "continue?" on a fresh session
  // would only add friction.
  function buildCheckpointPayload(qz) {
    if (!qz || qz.mode !== "practice" || qz.finished) return null;
    if ((qz.attempts || 0) === 0) return null;
    const unattempted = [
      ...(qz.practiceCurrent ? [qz.practiceCurrent] : []),
      ...(qz.remaining || []),
      ...((qz.practiceGroups || []).slice((qz.practiceGroupIndex ?? 0) + 1).flat()),
    ];
    const remainingKeys = [...new Set(unattempted.map(itemKey))];
    return {
      mode: "practice",
      type,
      idx: subIdxForCheckpoint,
      remaining: remainingKeys,
      retryCounts: qz.retryCounts || {},
      wrongAnswers: Object.fromEntries(
        Object.entries(qz.wrongAnswers || {}).map(([k, v]) => [k, { selected: v.selected }])
      ),
      mastered: qz.mastered || 0,
      attempts: qz.attempts || 0,
      firstTryCorrect: qz.firstTryCorrect || 0,
      totalUnique: qz.totalUnique || 0,
      completedCount: Math.max(0, (qz.totalUnique || 0) - remainingKeys.length),
      startedAt: qz.startTime || Date.now(),
      completed: false,
    };
  }

  const flushCheckpoint = useCallback(async (qz) => {
    if (!cat) return;
    const checkpoint = buildCheckpointPayload(qz);
    if (!checkpoint) return;
    const res = await saveCheckpoint(user, id, checkpoint);
    setSavingNote(res.ok ? "saved" : "error");
    if (!res.ok) flashToast("⚠ Progress could not be saved — check your connection");
    setTimeout(() => setSavingNote(null), 1600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, id, subIdxForCheckpoint, type, user]);

  const saveTimerRef = useRef(null);
  const scheduleCheckpointSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushCheckpoint(quizRef.current), 900);
  }, [flushCheckpoint]);

  // save immediately when leaving (tab close, route change, background)
  useEffect(() => {
    const flushNow = () => {
      const qz = quizRef.current;
      const checkpoint = buildCheckpointPayload(qz);
      if (!checkpoint) return;
      const body = JSON.stringify({ type: "checkpoint", catId: id, checkpoint });
      if (user) {
        try { fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }); } catch {}
      } else {
        try {
          const all = JSON.parse(window.localStorage.getItem("qh_practice_checkpoints") || "{}");
          all[id] = { ...checkpoint, updatedAt: Date.now() };
          window.localStorage.setItem("qh_practice_checkpoints", JSON.stringify(all));
        } catch {}
      }
    };
    const onVis = () => { if (document.visibilityState === "hidden") flushNow(); };
    window.addEventListener("beforeunload", flushNow);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", flushNow);
      document.removeEventListener("visibilitychange", onVis);
      // route-change/unmount: flush whatever is pending
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      flushNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, subIdxForCheckpoint, user]);

  // ================= Data loading =================
  const loadCategory = useCallback(() => {
    setLoadError(null);
    setEmpty(false);
    fetch(`/api/questions?id=${id}`)
      .then((r) => { if (!r.ok) throw new Error("Could not load questions"); return r.json(); })
      .then((d) => {
        if (!d.category) throw new Error("Questions not found for this subject.");
        setCat(d.category);
      })
      .catch((e) => { setLoadError(e.message || "Something went wrong while loading."); setCat(null); });
    fetch("/api/progress").then((r) => r.json()).then((d) => setProgress(d.progress)).catch(() => {});
  }, [id]);

  useEffect(() => { loadCategory(); }, [loadCategory]);

  function buildQueue(category, qType, qIdx) {
    const all = [];
    category.subcats.forEach((sc, sIdx) => sc.questions.forEach((q) => all.push({ subIdx: sIdx, subName: sc.name, q })));
    if (qType === "full") return all;
    if (qType === "random") return shuffle(all).slice(0, Math.min(30, all.length));
    if (qType === "sub") {
      const sIdx = parseInt(qIdx);
      const sc = category.subcats[sIdx];
      return sc ? sc.questions.map((q) => ({ subIdx: sIdx, subName: sc.name, q })) : [];
    }
    return all;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function buildSpecialQueue(category, qType, prog) {
    // bookmarked / missed need the progress document first
    if (qType === "bookmarked") {
      const keys = new Set(prog?.bookmarks?.[category.id] || []);
      const out = [];
      category.subcats.forEach((sc, sIdx) => sc.questions.forEach((q) => { if (keys.has(sIdx + "-" + q.num)) out.push({ subIdx: sIdx, subName: sc.name, q }); }));
      return out;
    }
    if (qType === "missed") {
      const miss = prog?.missCounts?.[category.id] || {};
      const keys = Object.keys(miss).filter((k) => miss[k] > 0);
      const out = [];
      category.subcats.forEach((sc, sIdx) => sc.questions.forEach((q) => { if (keys.includes(sIdx + "-" + q.num)) out.push({ subIdx: sIdx, subName: sc.name, q }); }));
      return shuffle(out);
    }
    return null;
  }

  function chunkPracticeQueue(queue, size = 5) {
    const chunks = [];
    for (let i = 0; i < queue.length; i += size) { chunks.push(queue.slice(i, i + size)); }
    return chunks;
  }

  function rewardForPerformance(pct) {
    if (pct >= 90) return { label: "Legendary", emoji: "🏆", xp: "+25 XP", tone: "gold" };
    if (pct >= 80) return { label: "Excellent", emoji: "🥇", xp: "+18 XP", tone: "gold" };
    if (pct >= 70) return { label: "Strong", emoji: "⭐", xp: "+12 XP", tone: "silver" };
    if (pct >= 55) return { label: "Solid", emoji: "✨", xp: "+8 XP", tone: "bronze" };
    return { label: "Review Run", emoji: "🔁", xp: "+4 XP", tone: "neutral" };
  }

  function initQuiz(queue, category) {
    const practiceGroups = mode === "practice" ? chunkPracticeQueue(queue, 5) : [];
    setQuiz({
      catId: category.id,
      mode,
      order: queue,
      pos: 0,
      answered: false,
      selected: null,
      score: 0,
      total: queue.length,
      missed: [],
      remaining: mode === "practice" ? (practiceGroups[0]?.slice(1) || []) : null,
      mastered: 0,
      totalUnique: queue.length,
      attempts: 0,
      firstTryCorrect: 0,
      retryCounts: {},
      wrongAnswers: {},
      practiceCurrent: mode === "practice" ? (practiceGroups[0]?.[0] || null) : null,
      practiceGroups,
      practiceGroupIndex: mode === "practice" ? 0 : null,
      groupCorrect: 0,
      groupTotal: 0,
      waitingForNextCheckpoint: false,
      checkpointSummary: null,
      rewardHistory: [],
      startTime: Date.now(),
      resumed: false,
    });
  }

  // restore a saved practice session
  function restoreFromCheckpoint(cp, category) {
    const lookup = new Map();
    category.subcats.forEach((sc, sIdx) => sc.questions.forEach((q) => lookup.set(sIdx + "-" + q.num, { subIdx: sIdx, subName: sc.name, q })));
    const remainingItems = (cp.remaining || []).filter((k) => lookup.has(k)).map((k) => lookup.get(k));
    if (remainingItems.length === 0) { removeCheckpoint(user, id); startFresh(category); return; }
    const wrongAnswers = {};
    Object.entries(cp.wrongAnswers || {}).forEach(([k, v]) => {
      if (lookup.has(k)) wrongAnswers[k] = { item: lookup.get(k), selected: v.selected };
    });
    const groups = chunkPracticeQueue(remainingItems, 5);
    setQuiz({
      catId: category.id,
      mode: "practice",
      order: remainingItems,
      pos: 0,
      answered: false,
      selected: null,
      score: 0,
      total: remainingItems.length,
      missed: [],
      remaining: groups[0]?.slice(1) || [],
      mastered: cp.mastered || 0,
      totalUnique: cp.totalUnique || remainingItems.length,
      attempts: cp.attempts || 0,
      firstTryCorrect: cp.firstTryCorrect || 0,
      retryCounts: cp.retryCounts || {},
      wrongAnswers,
      practiceCurrent: groups[0]?.[0] || null,
      practiceGroups: groups,
      practiceGroupIndex: 0,
      groupCorrect: 0,
      groupTotal: 0,
      waitingForNextCheckpoint: false,
      checkpointSummary: null,
      rewardHistory: [],
      startTime: cp.startedAt || Date.now(),
      resumed: true,
    });
    setResumeOffer(null);
    flashToast("✓ Session restored — continuing where you left off");
  }

  function startFresh(category) {
    const special = buildSpecialQueue(category, type, progress);
    let queue;
    if (special) queue = special;
    else {
      queue = buildQueue(category, type, idx);
      if (queue.length === 0 && type !== "bookmarked" && type !== "missed") { setEmpty(true); return; }
    }
    if (queue.length === 0) { setEmpty(true); return; }
    setResumeOffer(null);
    initQuiz(queue, category);
  }

  // reset any live session when the session definition changes (nav between
  // full / random / sub / bookmarked / missed, or mode switches)
  useEffect(() => {
    setQuiz(null);
    setResumeOffer(null);
    setEmpty(false);
  }, [id, type, idx, mode]);

  // build the queue and start — or, in practice mode, offer to resume a
  // saved session that matches the same chapter + range
  useEffect(() => {
    if (!cat) return;
    if (mode !== "test" && mode !== "practice") return; // listen has its own effect
    if (quiz) return;
    // bookmarks, misses and (for logged-in users) checkpoints live in the
    // progress document — wait for it before deciding
    const needsProgress = type === "bookmarked" || type === "missed" || (mode === "practice" && user);
    if (needsProgress && !progress) return;
    if (type === "bookmarked" || type === "missed") {
      const queue = buildSpecialQueue(cat, type, progress);
      if (!queue || queue.length === 0) { setEmpty(true); return; }
      if (mode === "practice") maybeOfferResume(queue, cat); else initQuiz(queue, cat);
      return;
    }
    const queue = buildQueue(cat, type, idx);
    if (queue.length === 0) { setEmpty(true); return; }
    if (mode === "practice") maybeOfferResume(queue, cat); else initQuiz(queue, cat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, progress, mode, type, idx, quiz]);

  function maybeOfferResume(queue, category) {
    const cp = readCheckpoint(user, id, progress);
    const matchesType = cp && cp.type === type && (cp.idx ?? null) === subIdxForCheckpoint;
    if (matchesType && (cp.remaining || []).length > 0) {
      if (resumeNow) { restoreFromCheckpoint(cp, category); return; }
      setResumeOffer({ checkpoint: cp });
      return;
    }
    if (resumeNow) { /* nothing to resume — start normally */ }
    initQuiz(queue, category);
  }

  const startNextPracticeCheckpoint = () => {
    if (!quiz || quiz.mode !== "practice") return;
    setQuiz((q) => {
      if (!q.practiceGroups || q.practiceGroupIndex === null) return { ...q, finished: true };
      const nextIndex = q.practiceGroupIndex + 1;
      const hasNext = nextIndex < q.practiceGroups.length;
      if (!hasNext) {
        return { ...q, waitingForNextCheckpoint: false, checkpointSummary: null, finished: true };
      }
      const nextGroup = q.practiceGroups[nextIndex];
      return {
        ...q,
        practiceGroupIndex: nextIndex,
        practiceCurrent: nextGroup[0],
        remaining: nextGroup.slice(1),
        answered: false,
        selected: null,
        waitingForNextCheckpoint: false,
        checkpointSummary: null,
        groupCorrect: 0,
        groupTotal: 0,
      };
    });
    scheduleCheckpointSave();
  };

  const selectOption = async (choiceIdx) => {
    if (!quiz || quiz.answered) return;
    const item = current;
    const correct = choiceIdx === item.q.correct;
    const updated = { ...quiz, answered: true, selected: choiceIdx };
    if (quiz.mode === "test") {
      if (correct) updated.score++;
      else updated.missed.push({ item, selected: choiceIdx });
    } else {
      updated.attempts++;
      const groupTotal = (quiz.groupTotal || 0) + 1;
      updated.groupTotal = groupTotal;
      const rkey = itemKey(item);
      if (correct) {
        updated.groupCorrect = (quiz.groupCorrect || 0) + 1;
        if (!(rkey in quiz.retryCounts)) updated.firstTryCorrect++;
        updated.mastered++;
      } else {
        updated.retryCounts[rkey] = (updated.retryCounts[rkey] || 0) + 1;
        updated.wrongAnswers = { ...quiz.wrongAnswers, [rkey]: { item, selected: choiceIdx } };
        const remaining = [...(updated.remaining || [])];
        const insertPos = remaining.length === 0 ? 0 : 1 + Math.floor(Math.random() * remaining.length);
        remaining.splice(insertPos, 0, item);
        updated.remaining = remaining;
      }
    }
    setQuiz(updated);
    if (quiz.mode === "test") {
      try {
        await fetch("/api/progress", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "answer", catId: quiz.catId, subIdx: item.subIdx, num: item.q.num, correct, mode: "test" }),
        });
      } catch {}
    } else {
      scheduleCheckpointSave();
    }
  };

  const nextQuestion = async () => {
    if (!quiz) return;
    if (quiz.mode === "test") {
      const nextPos = quiz.pos + 1;
      if (nextPos >= quiz.order.length) {
        const snap = quiz;
        try {
          await fetch("/api/progress", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "complete", catId: snap.catId,
              kind: type === "full" ? "FULL" : type === "random" ? "RANDOM" : type === "bookmarked" ? "BOOKMARKED" : type === "missed" ? "MISSED" : String(idx),
              score: snap.score, total: snap.total, mode: "test",
            }),
          });
        } catch {}
        setQuiz((q) => ({ ...q, finished: true, pct: Math.round(q.score / q.total * 100) }));
        return;
      }
      setQuiz((q) => ({ ...q, pos: nextPos, answered: false, selected: null }));
    } else {
      if (quiz.remaining.length === 0) {
        const totalInGroup = quiz.groupTotal || 0;
        const correctInGroup = quiz.groupCorrect || 0;
        const pct = totalInGroup > 0 ? Math.round((correctInGroup / totalInGroup) * 100) : 0;
        const reward = rewardForPerformance(pct);
        const currentGroupNumber = (quiz.practiceGroupIndex ?? 0) + 1;
        const totalGroups = quiz.practiceGroups?.length || 1;
        const summary = { correct: correctInGroup, total: totalInGroup, pct, reward, groupNumber: currentGroupNumber, totalGroups };
        if ((quiz.practiceGroupIndex ?? 0) + 1 < (quiz.practiceGroups?.length || 0)) {
          setQuiz((q) => ({ ...q, waitingForNextCheckpoint: true, checkpointSummary: summary, answered: false, selected: null, practiceCurrent: null, remaining: [], rewardHistory: [...q.rewardHistory, reward] }));
          scheduleCheckpointSave();
          return;
        }
        setQuiz((q) => ({ ...q, finished: true, waitingForNextCheckpoint: false, checkpointSummary: summary, rewardHistory: [...q.rewardHistory, reward] }));
        removeCheckpoint(user, id); // chapter finished — no need to keep the session
        return;
      }
      setQuiz((q) => {
        const remaining = [...q.remaining];
        const nextItem = remaining.shift();
        return { ...q, practiceCurrent: nextItem, answered: false, selected: null, remaining };
      });
      scheduleCheckpointSave();
    }
  };

  const toggleBookmark = async () => {
    const activeItem = mode === "listen" ? (listenQueue?.[lp.qIdx] || null) : current;
    if (!activeItem) return;
    const key = activeItem.subIdx + "-" + activeItem.q.num;
    const wasBookmarked = !!progress?.bookmarks?.[id]?.includes(key);
    setProgress((p) => {
      const base = p || {};
      const existing = base.bookmarks?.[id] || [];
      const nextList = wasBookmarked ? existing.filter((k) => k !== key) : [...existing, key];
      return { ...base, bookmarks: { ...(base.bookmarks || {}), [id]: nextList } };
    });
    flashToast(wasBookmarked ? "Bookmark removed" : "★ Bookmarked");
    try {
      await fetch("/api/progress", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bookmark", catId: id, subIdx: activeItem.subIdx, num: activeItem.q.num }),
      });
    } catch {}
  };
  const isBookmarked = (() => {
    const activeItem = mode === "listen" ? (listenQueue?.[lp.qIdx] || null) : current;
    if (!activeItem || !progress) return false;
    return !!progress.bookmarks?.[id]?.includes(activeItem.subIdx + "-" + activeItem.q.num);
  })();

  const restart = () => {
    if (!cat) return;
    if (mode === "listen") {
      const out = (() => {
        if (type === "bookmarked") return buildSpecialQueue(cat, "bookmarked", progress) || [];
        if (type === "missed") return buildSpecialQueue(cat, "missed", progress) || [];
        return buildQueue(cat, type, idx);
      })();
      if (out.length > 0) {
        lp.stop();
        lp.seekQuestion(0);
        setListenQueue(out);
      }
      return;
    }
    removeCheckpoint(user, id);
    const q = buildQueue(cat, type, idx);
    if (q.length > 0) { initQuiz(q, cat); return; }
    if (type === "bookmarked" || type === "missed") setQuiz(null);
  };

  const retryWrong = () => {
    if (!cat || !quiz || quiz.mode !== "practice") return;
    const wrongItems = Object.values(quiz.wrongAnswers || {}).map((w) => w.item);
    if (wrongItems.length === 0) return;
    removeCheckpoint(user, id);
    initQuiz(wrongItems, cat);
  };

  // ================= Listen & Learn =================
  // (listenQueue + player hook are declared at the top with the other state)

  // persist voice + speed — server for logged-in users (follows the account
  // across devices), localStorage for guests
  useEffect(() => {
    if (lp.provider === undefined) return;      // provider probe not resolved yet
    if (mode !== "listen") return;              // only persist while the player is in use
    if (user && !progress) return;              // wait for synced prefs before writing
    const t = setTimeout(() => {
      savePrefs(user, { listenVoice: lp.voice, listenRate: lp.rate });
    }, 600);
    return () => clearTimeout(t);
  }, [lp.voice, lp.rate, lp.provider, user, progress, mode]);

  // apply account-synced prefs once, before first playback
  const prefsAppliedRef = useRef(false);
  useEffect(() => {
    if (prefsAppliedRef.current || !user || !progress || mode !== "listen") return;
    prefsAppliedRef.current = true;
    const p = progress.prefs || {};
    if (lp.speeds.includes(p.listenRate) && p.listenRate !== lp.rate) lp.setRate(p.listenRate);
    if ((p.listenVoice === "female" || p.listenVoice === "male") && p.listenVoice !== lp.voice) lp.chooseVoice(p.listenVoice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, progress, mode]);

  useEffect(() => {
    if (mode !== "listen" || !cat) return;
    if (type === "bookmarked" || type === "missed") {
      if (!progress) return;
      const out = buildSpecialQueue(cat, type, progress);
      if (out && out.length > 0) setListenQueue(out);
      else setEmpty(true);
      return;
    }
    const q = buildQueue(cat, type, idx);
    if (q.length === 0) { setEmpty(true); return; }
    setListenQueue(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, progress, mode, type, idx]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (mode === "listen" && listenQueue) {
        if (e.key === " ") { e.preventDefault(); lp.toggle(); }
        if (e.key === "ArrowRight") lp.goNext();
        if (e.key === "ArrowLeft") lp.goPrev();
        return;
      }
      if (!quiz || quiz.finished || quiz.waitingForNextCheckpoint) return;
      if (!quiz.answered) {
        const map = { "1": 0, "2": 1, "3": 2, "4": 3, a: 0, b: 1, c: 2, d: 3 };
        const pick = map[e.key?.toLowerCase?.()];
        if (pick !== undefined) { e.preventDefault(); selectOption(pick); }
      } else if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        nextQuestion();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, quiz, listenQueue, lp]);

  // ================= Render: loading / error / empty =================
  if (loadError) {
    return (
      <div className="quiz-wrap">
        <div className="error-card">
          <span className="dwg-tag mono">LOADING FAILED</span>
          <h2>Couldn&apos;t load this session</h2>
          <p>{loadError} Check your connection and try again.</p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={loadCategory}>↻ Try again</button>
            <Link href={`/subject/${id}`} className="btn secondary">Back to subject</Link>
          </div>
        </div>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="quiz-wrap">
        <div className="dwg-card">
          <span className="dwg-tag mono">NOTHING HERE YET</span>
          <p style={{ marginTop: 10 }}>There&apos;s nothing queued up here yet. Bookmark questions or answer a test first — then this space fills up.</p>
          <div className="btn-row">
            <Link href={`/subject/${id}`} className="btn secondary">Back to subject</Link>
          </div>
        </div>
      </div>
    );
  }

  // ================= Render: Listen mode =================
  if (mode === "listen") {
    if (!cat || !listenQueue) return <div className="loading-row"><span className="spinner"></span> Loading Listen &amp; Learn…</div>;
    if (lp.finished) {
      return (
        <div className="quiz-wrap">
          <div className="dwg-card">
            <span className="dwg-tag mono">LISTEN &amp; LEARN — COMPLETE</span>
            <h2 style={{ margin: "10px 0 6px" }}>You&apos;ve listened to all {listenQueue.length} questions</h2>
            <p className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>Great passive revision — switch to Test or Practice when you&apos;re ready to answer actively.</p>
            <div className="btn-row" style={{ marginTop: 18 }}>
              <button className="btn" onClick={lp.toggle}>↺ Replay all</button>
              <Link href={`/quiz/${id}?mode=practice&type=${type}${idx ? `&idx=${idx}` : ""}`} className="btn secondary">Practice mode</Link>
              <Link href={`/subject/${id}`} className="btn secondary">Back to subject</Link>
            </div>
            <div className="review-list" style={{ marginTop: 22 }}>
              <span className="dwg-tag mono">TRANSCRIPT ({listenQueue.length})</span>
              {listenQueue.map((it, i) => (
                <div key={i} className="review-item" style={{ borderLeftColor: "var(--accent)" }}>
                  <div className="rq">{i + 1}. {it.q.text}</div>
                  <div className="ra mono" style={{ color: "var(--muted)" }}>A) {it.q.options[0]} · B) {it.q.options[1]} · C) {it.q.options[2]} · D) {it.q.options[3]}</div>
                  <div className="ra right-ans mono">Answer: {String.fromCharCode(65 + it.q.correct)}) {it.q.options[it.q.correct]}</div>
                  <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--ink)" }}>{it.q.expl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    const item = listenQueue[lp.qIdx] || listenQueue[0];
    const q = item.q;
    const total = listenQueue.length;
    const pct = Math.round((lp.qIdx / total) * 100);
    const isPlaying = lp.isPlaying;
    const phases = ["question", "options", "answer", "expl"];
    const cloudActive = lp.provider != null; // null means fallback; undefined = still probing

    return (
      <div className="quiz-wrap listen-quiz-wrap">
        <div className="top-bar">
          <Link href={`/subject/${id}`} className="back-link">← Back</Link>
          <span className="score-badge mono">🎧 Listen &amp; Learn · {lp.qIdx + 1} / {total}</span>
        </div>
        <div className="eyebrow"><span>{item.subName} · Question {lp.qIdx + 1} of {total}</span><span>#{q.num} · LISTEN</span></div>
        <div
          className="quiz-progress-bar" role="slider" aria-label="Question progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={lp.qIdx + 1}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const p = (e.clientX - rect.left) / rect.width;
            lp.seekQuestion(Math.floor(p * total));
          }}
        >
          <div className="quiz-progress-fill" style={{ width: ((lp.qIdx + phaseFraction(lp.phase)) / total) * 100 + "%" }}></div>
        </div>

        <div className="listen-layout">
        {/* Player */}
        <div className="listen-player dwg-card">
          <div className="listen-row" style={{ justifyContent: "space-between" }}>
            <div className="listen-controls">
              <button className="btn play-btn" onClick={lp.toggle} aria-label={isPlaying ? "Pause" : "Play"}>
                {lp.status === "loading" ? <><span className="spinner"></span> Loading…</> : isPlaying ? "⏸ Pause" : "▶ Play"}
              </button>
              <button className="btn secondary" onClick={lp.stop} title="Stop and reset this question" aria-label="Stop">⏹ Stop</button>
              <button className="btn secondary" onClick={lp.goPrev} title="Previous question" aria-label="Previous question">⏮</button>
              <button className="btn secondary" onClick={lp.replayQuestion} title="Replay this question" aria-label="Replay question">↺</button>
              <button className="btn secondary" onClick={lp.goNext} title="Next question" aria-label="Next question">⏭</button>
            </div>
            <div className="listen-row">
              <span className="label-chip mono">Speed</span>
              <div className="speed-chips">
                {lp.speeds.map((r) => (
                  <button key={r} className={`speed-chip ${lp.rate === r ? "active" : ""}`} onClick={() => lp.setRate(r)} aria-pressed={lp.rate === r}>{r}×</button>
                ))}
              </div>
            </div>
          </div>

          {/* Status line */}
          <div className="listen-row" style={{ justifyContent: "space-between" }}>
            <span className="listen-status">
              {lp.status === "error" ? (
                "⚠ Playback problem"
              ) : lp.status === "loading" ? (
                <><span className="spinner"></span> Preparing audio…</>
              ) : isPlaying ? (
                <><span className="live-dot"></span> Speaking: {lp.phase}</>
              ) : lp.status === "paused" ? (
                "Paused"
              ) : (
                "Ready — press Play"
              )}
            </span>
            <span className="provider-note mono" title={cloudActive ? "Same cloud voice on every device" : "Using this device's speech engine"}>
              <span className="p-dot"></span>
              {cloudActive === undefined ? "Checking voices…" : cloudActive ? "Cloud voice — same on every device" : "Device voice (offline fallback)"}
            </span>
          </div>
          <div className="listen-batch-timer mono" aria-live="polite">
            <span>⏱ Batch timer</span>
            <strong>{formatListenTime(listenElapsed)} / ~{formatListenTime(listenEstimate)}</strong>
            <span className="listen-timer-remaining">
              {listenEstimate > listenElapsed ? `${formatListenTime(listenEstimate - listenElapsed)} remaining` : "Finishing"}
            </span>
          </div>

          {lp.error && (
            <div className="tts-error-banner" role="alert">
              <span>{lp.error}</span>
              <span className="btn-row" style={{ marginTop: 0 }}>
                <button className="btn small" onClick={lp.retry}>↻ Retry</button>
                <button className="btn small secondary" onClick={lp.skipSection}>Skip section</button>
              </span>
            </div>
          )}

          {/* Voice picker — exactly two Indian English voices */}
          <div>
            <span className="label-chip mono" style={{ display: "block", marginBottom: 8 }}>Voice</span>
            <div className="voice-grid">
              {[["female", "♀", "Indian English — Female"], ["male", "♂", "Indian English — Male"]].map(([vid, glyph, label]) => (
                <div
                  key={vid}
                  className={`voice-card ${lp.voice === vid ? "active" : ""}`}
                  role="radio" aria-checked={lp.voice === vid}
                  tabIndex={0}
                  onClick={() => lp.chooseVoice(vid)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); lp.chooseVoice(vid); } }}
                >
                  <span className="voice-icon">{glyph}</span>
                  <span className="voice-meta">
                    <span className="voice-name">{label}</span>
                    <span className="voice-sub">{cloudActive ? "Natural neural voice · saves automatically" : "Best available device voice"}</span>
                  </span>
                  <button
                    className="voice-preview" tabIndex={-1}
                    disabled={lp.previewing !== null}
                    onClick={(e) => { e.stopPropagation(); lp.previewVoice(vid); }}
                  >
                    {lp.previewing === vid ? <span className="spinner"></span> : "▶ Preview"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section tracker */}
          <div className="listen-row">
            {phases.map((ph) => {
              const active = lp.phase === ph;
              const done = phases.indexOf(lp.phase) > phases.indexOf(ph);

              return (
                <span key={ph} className={`listen-phase-dot badge ${active ? "edited" : done ? "new" : "neutral"}`} style={active ? { background: "var(--accent)", color: "#fff" } : undefined}>
                  {ph === "expl" ? "Explanation" : ph}
                </span>
              );
            })}
          </div>
        </div>

        {/* Live transcript — highlights the section being spoken */}
        <div className="dwg-card listen-transcript" style={{ padding: 24 }}>
          <div className="q-head-row" style={{ alignItems: "flex-start" }}>
            <p className="question-text" style={{
              opacity: lp.phase === "question" || !isPlaying ? 1 : 0.55,
              transition: "opacity .3s ease",
              borderLeft: lp.phase === "question" ? "3px solid var(--accent)" : "3px solid transparent",
              paddingLeft: lp.phase === "question" ? "12px" : "3px",
            }}>
              {isPlaying && lp.phase === "question" ? "🔊 " : ""}{q.text}
            </p>
            <button className={`bookmark-btn ${isBookmarked ? "active" : ""}`} onClick={toggleBookmark} title="Bookmark" aria-label="Bookmark question">★</button>
          </div>

          <div className={`options ${lp.phase === "answer" || lp.phase === "expl" ? "answered" : ""}`}>
            {q.options.map((opt, i) => {
              const isCorrect = i === q.correct;
              const reveal = lp.phase === "answer" || lp.phase === "expl";
              let cls = "option-row";
              if (reveal) cls += isCorrect ? " correct" : " dim";
              return (
                <div key={i} className={cls} style={{ cursor: "default" }}>
                  {reveal && isCorrect && <span className="stamp stamp-ok">✓ Answer</span>}
                  <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                  <span>{opt}</span>
                </div>
              );
            })}
          </div>

          {(lp.phase === "answer" || lp.phase === "expl") && (
            <div className="explain-box">
              <span className="label mono">Answer: {String.fromCharCode(65 + q.correct)} — {q.options[q.correct]}</span>
              <span style={{ opacity: lp.phase === "expl" ? 1 : 0.6, transition: "opacity .3s ease" }}>{q.expl}</span>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 14, justifyContent: "space-between" }}>
            <button className="btn secondary" onClick={lp.goPrev} disabled={lp.qIdx === 0}>← Previous</button>
            <button className="btn" onClick={lp.goNext}>{lp.qIdx + 1 === total ? "Finish →" : "Next →"}</button>
          </div>
        </div>
        </div>

        <div className="mono" style={{ fontSize: 11, color: "var(--dim)", textAlign: "center", marginTop: 6 }}>
          Tap the progress bar to jump · {pct}% through this batch · Space = play/pause
        </div>
        <Toast message={toastMsg} show={toastShow} />
      </div>
    );
  }

  // ================= Render: quiz (test / practice) =================
  if (!cat) return <div className="loading-row"><span className="spinner"></span> Loading quiz…</div>;

  // Resume prompt — shown before a saved practice session is re-entered
  if (mode === "practice" && resumeOffer && !quiz) {
    const cp = resumeOffer.checkpoint;
    const done = cp.completedCount || 0;
    const totalU = cp.totalUnique || 0;
    const pct = totalU > 0 ? Math.round((done / totalU) * 100) : 0;
    const posLabel = Math.min(totalU, done + 1);
    return (
      <div className="quiz-wrap">
        <div className="top-bar"><Link href={`/subject/${id}`} className="back-link">← Back</Link></div>
        <div className="resume-card">
          <span className="dwg-tag mono">CHECKPOINT FOUND</span>
          <h2 className="resume-title">Continue your practice session?</h2>
          <p className="resume-sub">You have an unfinished session in <b>{cat.title}</b>.</p>
          <div className="resume-progress">
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{done}/{totalU}</span>
            <div className="bar"><div className="fill" style={{ width: pct + "%" }}></div></div>
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{pct}%</span>
          </div>
          <div className="resume-meta">
            <span>You were on <b>question {posLabel} of {totalU}</b></span>
            <span>Mastered so far: <b>{cp.mastered || 0}</b></span>
            <span>Last activity: <b>{timeAgo(cp.updatedAt)}</b></span>
          </div>
          <div className="resume-actions">
            <button className="btn" onClick={() => restoreFromCheckpoint(cp, cat)}>▶ Continue session</button>
            <button className="btn secondary" onClick={() => { removeCheckpoint(user, id); startFresh(cat); }}>↺ Start again</button>
            <Link href={`/subject/${id}`} className="btn ghost">Not now</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!quiz) return <div className="loading-row"><span className="spinner"></span> Loading quiz…</div>;

  if (quiz.finished) {
    if (quiz.mode === "test") {
      const isCelebrated = quiz.pct >= 70;
      const badgeLabel = quiz.pct >= 90 ? "Outstanding" : quiz.pct >= 80 ? "Great Work" : "Well Done";
      return (
        <div className="quiz-wrap">
          <div className={`dwg-card ${isCelebrated ? "result-celebrated" : ""}`}>
            {isCelebrated && <Confetti />}
            {isCelebrated ? (
              <span className="result-badge">{badgeLabel} · {quiz.pct}%</span>
            ) : (
              <span className="dwg-tag mono">RESULT · TEST MODE</span>
            )}
            <p className="result-score">{quiz.score}/{quiz.total}</p>
            <p className="result-pct mono">{quiz.pct}% {isCelebrated ? "· Celebration unlocked" : "· Keep practicing"}</p>
            <div className="progress-bar"><div className="progress-fill" style={{ width: quiz.pct + "%" }}></div></div>
            {isCelebrated && <p className="verdict">You cleared the threshold — blueprint complete. The fireworks are for you.</p>}
            {!isCelebrated && <p className="verdict">Almost there — review your misses and try again. The next celebration is closer than you think.</p>}
            <div className="btn-row">
              <button className="btn" onClick={restart}>↺ Retry full batch</button>
              <Link href={`/subject/${id}`} className="btn secondary">Back to subject</Link>
              <Link href="/" className="btn secondary">Home</Link>
            </div>
            {quiz.missed.length > 0 && (
              <div className="review-list">
                <span className="dwg-tag mono">MISSED ({quiz.missed.length})</span>
                {quiz.missed.map((m, i) => (
                  <div key={i} className="review-item">
                    <div className="rq">{m.item.q.text}</div>
                    <div className="ra wrong-ans mono">Your: {String.fromCharCode(65 + m.selected)}) {m.item.q.options[m.selected]}</div>
                    <div className="ra right-ans mono">Correct: {String.fromCharCode(65 + m.item.q.correct)}) {m.item.q.options[m.item.q.correct]}</div>
                    <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--ink)" }}>{m.item.q.expl}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    const wrongList = Object.values(quiz.wrongAnswers || {});
    const practicePct = quiz.totalUnique > 0 ? Math.round((quiz.firstTryCorrect / quiz.totalUnique) * 100) : 0;
    const isCelebrated = practicePct >= 70;
    return (
      <div className="quiz-wrap">
        <div className={`dwg-card ${isCelebrated ? "result-celebrated" : ""}`}>
          {isCelebrated && <Confetti />}
          <span className="dwg-tag mono">RESULT · PRACTICE MODE</span>
          <p className="result-score">Mastered {quiz.totalUnique}</p>
          {isCelebrated && <p className="result-pct mono">All questions mastered — {practicePct}% on first try</p>}
          {!isCelebrated && <p className="result-pct mono">{practicePct}% first-try · Resilience counts too</p>}
          <div className="stat-grid">
            <div className="stat-box"><div className="num"><Counter value={quiz.totalUnique} /></div><div className="lab mono">Mastered</div></div>
            <div className="stat-box"><div className="num"><Counter value={quiz.attempts} /></div><div className="lab mono">Attempts</div></div>
            <div className="stat-box"><div className="num"><Counter value={quiz.firstTryCorrect} /></div><div className="lab mono">First Try Correct</div></div>
          </div>
          {isCelebrated && <p className="verdict">Every re-queue you survived made this glow possible. Beautiful persistence.</p>}
          <div className="btn-row">
            <button className="btn" onClick={restart}>↺ Retry full batch</button>
            {wrongList.length > 0 && <button className="btn secondary" onClick={retryWrong}>Retry wrong answers ({wrongList.length})</button>}
            <Link href={`/subject/${id}`} className="btn secondary">Back</Link>
          </div>
          {wrongList.length > 0 && (
            <div className="review-list">
              <span className="dwg-tag mono">ANSWERED WRONG AT LEAST ONCE ({wrongList.length})</span>
              {wrongList.map((m, i) => (
                <div key={i} className="review-item">
                  <div className="rq">{m.item.q.text}</div>
                  <div className="ra wrong-ans mono">Your: {String.fromCharCode(65 + m.selected)}) {m.item.q.options[m.selected]}</div>
                  <div className="ra right-ans mono">Correct: {String.fromCharCode(65 + m.item.q.correct)}) {m.item.q.options[m.item.q.correct]}</div>
                  <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--ink)" }}>{m.item.q.expl}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (quiz.mode === "practice" && quiz.waitingForNextCheckpoint) {
    const summary = quiz.checkpointSummary || {};
    const reward = summary.reward || { label: "Reward", emoji: "✨", xp: "+0 XP", tone: "neutral" };
    const nextLabel = (quiz.practiceGroupIndex ?? 0) + 1 >= (quiz.practiceGroups?.length || 1) ? "Finish chapter" : "Next checkpoint →";
    return (
      <div className="quiz-wrap">
        <div className="dwg-card" style={{ padding: 26 }}>
          <span className="dwg-tag mono">CHECKPOINT COMPLETE</span>
          <h2 style={{ margin: "12px 0 4px" }}>Checkpoint {summary.groupNumber || 1} of {summary.totalGroups || 1}</h2>
          <p className="result-score" style={{ margin: 0 }}>{summary.correct || 0}/{summary.total || 0}</p>
          <p className="result-pct mono">{summary.pct || 0}% accuracy · Reward: {reward.emoji} {reward.label}</p>
          <div className="progress-bar"><div className="progress-fill" style={{ width: (summary.pct || 0) + "%" }}></div></div>
          <div className="resume-meta" style={{ marginTop: 10 }}>
            <span>✓ Progress saved — you can close this page and resume anytime</span>
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={startNextPracticeCheckpoint}>{nextLabel}</button>
            <Link href={`/subject/${id}`} className="btn secondary">Back</Link>
          </div>
        </div>
      </div>
    );
  }

  const q = current.q;
  const progressPct = quiz.mode === "test"
    ? Math.round(((quiz.pos + (quiz.answered ? 1 : 0)) / quiz.total) * 100)
    : Math.round((quiz.mastered / quiz.totalUnique) * 100);
  const practiceCheckpointText = quiz.mode === "practice" && quiz.practiceGroups ? `Checkpoint ${((quiz.practiceGroupIndex ?? 0) + 1)}/${quiz.practiceGroups.length}` : null;
  const checkpointMarkers = quiz.mode === "practice" && quiz.practiceGroups ? quiz.practiceGroups.map((_, index) => ({
    left: (((index + 1) / quiz.practiceGroups.length) * 100),
    active: index <= (quiz.practiceGroupIndex ?? 0),
    label: index + 1,
  })) : [];

  return (
    <div className="quiz-wrap">
      <div className="top-bar">
        <Link href={`/subject/${id}`} className="back-link">← Back</Link>
        <span className="btn-row" style={{ marginTop: 0, gap: 8 }}>
          {quiz.mode === "practice" && savingNote === "saved" && <span className="mono" style={{ fontSize: 11, color: "var(--correct)" }}>✓ saved</span>}
          {quiz.mode === "practice" && savingNote === "error" && <span className="mono" style={{ fontSize: 11, color: "var(--wrong)" }}>⚠ save failed</span>}
          <span className="score-badge mono">{quiz.mode === "test" ? `Score: ${quiz.score}/${quiz.pos + (quiz.answered ? 1 : 0)}` : `Attempts: ${quiz.attempts}`}</span>
        </span>
      </div>
      <div className="eyebrow">
        <span>{current.subName} · {quiz.mode === "test" ? `Question ${quiz.pos + 1} of ${quiz.total}` : practiceCheckpointText ? `${practiceCheckpointText} · Mastered ${quiz.mastered} of ${quiz.totalUnique}` : `Mastered ${quiz.mastered} of ${quiz.totalUnique}`}</span>
        <span>#{q.num} · {quiz.mode.toUpperCase()}</span>
      </div>
      <div className="quiz-progress-bar">
        <div className="quiz-progress-fill" style={{ width: progressPct + "%" }}></div>
        {checkpointMarkers.map((marker) => (
          <div key={marker.label} className={`quiz-progress-marker ${marker.active ? "active" : ""}`} style={{ left: `${marker.left}%` }} title={`Checkpoint ${marker.label}`} />
        ))}
      </div>
      <div className="dwg-card" key={(quiz.mode === "test" ? quiz.pos : quiz.attempts) + "-" + q.num}>
        <div className="q-head-row q-transition">
          <p className="question-text">{q.text}</p>
          <button className={`bookmark-btn ${isBookmarked ? "active" : ""}`} onClick={toggleBookmark} title="Bookmark" aria-label="Bookmark question">★</button>
        </div>
        <div className={`options ${quiz.answered ? "answered" : ""}`}>
          {q.options.map((opt, i) => {
            let cls = "option-row";
            let showOk = false, showNo = false;
            if (quiz.answered) {
              if (i === q.correct) { cls += " correct"; showOk = true; }
              else if (i === quiz.selected) { cls += " wrong"; showNo = true; }
              else cls += " dim";
            }
            return (
              <div key={i} className={cls} onClick={() => selectOption(i)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectOption(i); } }}>
                {showOk && <span className="stamp stamp-ok">✓ Correct</span>}
                {showNo && <span className="stamp stamp-no">✗ Your answer</span>}
                <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                <span>{opt}</span>
              </div>
            );
          })}
        </div>
        {quiz.answered && (
          <div className="explain-box">
            <span className="label mono">{quiz.selected === q.correct ? "Correct" : "Explanation"} · Answer: {String.fromCharCode(65 + q.correct)}</span>
            {q.expl}
            {quiz.mode === "practice" && quiz.selected !== q.correct && <div className="practice-note">This question will resurface later.</div>}
          </div>
        )}
        <div className="btn-row end" style={{ alignItems: "center", gap: 14 }}>
          <span className="kbd-hint" style={{ margin: 0 }}>
            <span><kbd>1</kbd>–<kbd>4</kbd> answer</span>
            <span><kbd>↵</kbd> next</span>
          </span>
          <button className="btn" onClick={nextQuestion} disabled={!quiz.answered}>Next →</button>
        </div>
      </div>
      <Toast message={toastMsg} show={toastShow} />
    </div>
  );
}

function phaseFraction(phase) {
  return { question: 0.15, options: 0.4, answer: 0.7, expl: 0.95, idle: 0 }[phase] ?? 0;
}

function timeAgo(ts) {
  if (!ts) return "just now";
  const s = Math.max(1, Math.floor((Date.now() - Number(ts)) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}
