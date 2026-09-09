"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { monogram } from "@/lib/badge";

const EMPTY_FORM = { text: "", options: ["", "", "", ""], correct: 0, expl: "" };
const GROUP_LABELS = { civil1: "Civil 1", civil2: "Civil 2", nontechnical: "Non-Technical" };
const GROUP_ORDER = ["civil1", "civil2", "nontechnical"];
const PAGE_SIZE = 12;

function timeAgo(dateStr) {
  if (!dateStr) return "recently";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function AdminPage(){
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cats, setCats] = useState([]);
  const [catsLoaded, setCatsLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [activeTab, setActiveTab] = useState("content"); // 'content' | 'settings'

  // Top-level admin navigation: an at-a-glance Dashboard, separate from the
  // Subjects workspace (sidebar + editor) below it.
  const [view, setView] = useState("dashboard"); // 'dashboard' | 'subjects'
  const [dashStats, setDashStats] = useState(null); // { totalUsers, recentSubjects } | null while loading
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile/tablet drawer

  // Question list: sort + bulk selection
  const [sortBy, setSortBy] = useState("num"); // 'num' | 'az' | 'za'
  const [selectedQs, setSelectedQs] = useState(() => new Set()); // keys "subIdx-num"

  // Guards a pending navigation (tab switch / subject switch / initial
  // restore) that would discard unsaved Settings-tab edits.
  const [pendingNav, setPendingNav] = useState(null); // () => void

  // Chapter (subtopic) + question browsing state
  const [activeChapterIdx, setActiveChapterIdx] = useState(null); // null = "All chapters"
  const [qSearch, setQSearch] = useState("");
  const [page, setPage] = useState(1);

  // Question modal: { mode:'add'|'edit', subIdx, num? }
  const [qModal, setQModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [metaForm, setMetaForm] = useState({ title: "", description: "", group: "civil1" });
  const [savedMetaForm, setSavedMetaForm] = useState({ title: "", description: "", group: "civil1" });

  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ title: "", description: "", group: "civil1" });

  const [newChapterOpen, setNewChapterOpen] = useState(false);
  const [newChapterName, setNewChapterName] = useState("");
  const [renaming, setRenaming] = useState(null); // { subIdx, value }

  const [importFile, setImportFile] = useState(null);
  const [importGroup, setImportGroup] = useState("civil1");
  const [importPreview, setImportPreview] = useState(null); // { title, subcats, questions } | { error }

  const [msg, setMsg] = useState(null); // { type:'ok'|'err', text }
  const [formErrors, setFormErrors] = useState({}); // field-level highlights for the question modal
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmState, setConfirmState] = useState(null); // { kind, subIdx, num, busy }
  const msgTimer = useRef(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) { router.push("/"); return; }
    if (user && user.role === "admin") {
      try {
        const savedGroups = JSON.parse(localStorage.getItem("qh-admin-collapsed") || "{}");
        setCollapsedGroups(savedGroups);
      } catch {}
      refreshCats();
      refreshDashStats();
    }
  }, [user, loading, router]);

  // Restore the last-viewed subject once the category list has loaded, so
  // reloading the admin panel drops the admin back where they left off.
  useEffect(() => {
    if (!catsLoaded || selectedId || !cats.length) return;
    const lastId = localStorage.getItem("qh-admin-last-subject");
    if (lastId && cats.some(c => c.id === lastId)) loadCat(lastId);
  }, [catsLoaded, cats]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (qModal) { requestCloseModal(); return; }
      if (newSubjectOpen) { setNewSubjectOpen(false); return; }
      if (newChapterOpen) { setNewChapterOpen(false); return; }
      if (msg) setMsg(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qModal, form, newSubjectOpen, newChapterOpen, msg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock background scroll while the mobile/tablet subjects drawer is open,
  // and let Escape close it like the other overlays.
  useEffect(() => {
    if (!sidebarOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [sidebarOpen]);

  // Warn before an accidental tab close/refresh drops unsaved Settings edits.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!isMetaDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }); // intentionally no deps array — always reads the latest dirty flag

  // Cmd/Ctrl+S saves Settings edits in place instead of triggering the
  // browser's "Save Page" dialog.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && activeTab === "settings" && isMetaDirty && !busy) {
        e.preventDefault();
        saveSubjectMeta();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // intentionally no deps array — always reads the latest form state

  const flash = (type, text) => {
    setMsg({ type, text });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 4500);
  };

  // Every mutation goes through this so a failure is always visible instead
  // of silently doing nothing: network errors and non-JSON error pages (e.g.
  // a 500 from a filesystem write that failed) both get turned into a
  // flashed message rather than an uncaught rejection.
  const apiRequest = async (url, options) => {
    let res;
    try {
      res = await fetch(url, { cache: "no-store", ...options });
    } catch {
      flash("err", "Couldn't reach the server. Check your connection and try again.");
      return { ok: false, json: null };
    }
    let json = null;
    try { json = await res.json(); }
    catch {
      flash("err", `Server error (${res.status}). The change was not saved.`);
      return { ok: false, json: null };
    }
    return { ok: res.ok, json };
  };

  // The sidebar only needs metadata; full question bodies load when a subject
  // is selected.
  const refreshCats = () => fetch("/api/questions?meta=1", { cache: "no-store" })
    .then(r => r.json())
    .then(d => { setCats(d.categories || []); setCatsLoaded(true); });

  const refreshDashStats = () => fetch("/api/admin/stats", { cache: "no-store" })
    .then(r => r.json())
    .then(d => { if (!d.error) setDashStats(d); })
    .catch(() => {});

  const loadCat = async (id) => {
    setSelectedId(id);
    setActiveTab("content");
    setActiveChapterIdx(null);
    setQSearch("");
    setSortBy("num");
    setSelectedQs(new Set());
    setPage(1);
    setRenaming(null);
    setQModal(null);
    setNewChapterOpen(false);
    setSidebarOpen(false);
    localStorage.setItem("qh-admin-last-subject", id);
    const d = await fetch(`/api/questions?id=${id}`, { cache: "no-store" }).then(r => r.json());
    setEditCat(d.category);
    const meta = { title: d.category?.title || "", description: d.category?.description || "", group: d.category?.group || "civil1" };
    setMetaForm(meta);
    setSavedMetaForm(meta);
  };

  // like loadCat but keeps chapter/page/search state, for smooth in-place edits
  const loadCatQuiet = async (id) => {
    const d = await fetch(`/api/questions?id=${id}`, { cache: "no-store" }).then(r => r.json());
    setEditCat(d.category);
  };

  const toggleGroup = (g) => setCollapsedGroups(s => {
    const next = { ...s, [g]: !s[g] };
    try { localStorage.setItem("qh-admin-collapsed", JSON.stringify(next)); } catch {}
    return next;
  });

  // Settings-tab edits are only "unsaved" while that subject's form differs
  // from what's actually on disk — used to warn before it'd be lost.
  const isMetaDirty = !!editCat && (
    metaForm.title !== savedMetaForm.title ||
    metaForm.description !== savedMetaForm.description ||
    metaForm.group !== savedMetaForm.group
  );

  // Runs `fn` immediately, unless Settings has unsaved edits — in which case
  // it's deferred behind a confirmation so a stray click can't silently
  // discard them.
  const guardedNav = (fn) => {
    if (isMetaDirty) { setPendingNav(() => fn); return; }
    fn();
  };

  const exportSubject = async (cat) => {
    if (!cat) return;
    try {
      const res = await fetch(`/api/admin/subjects?action=export&id=${encodeURIComponent(cat.id)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        flash("err", j.error || "Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${cat.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flash("ok", `Exported "${cat.title}".`);
    } catch {
      flash("err", "Export failed.");
    }
  };

  const copyId = () => {
    if (!editCat) return;
    navigator.clipboard?.writeText(editCat.id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ---------- Question modal ----------
  const initialFormRef = useRef(EMPTY_FORM);
  const isModalDirty = !!qModal && JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  const openAddModal = () => {
    if (!editCat.subcats.length) { flash("err", "Add a chapter first."); return; }
    const subIdx = activeChapterIdx !== null ? activeChapterIdx : 0;
    setForm(EMPTY_FORM);
    setFormErrors({});
    initialFormRef.current = EMPTY_FORM;
    setQModal({ mode: "add", subIdx });
  };
  const openEditModal = (subIdx, q) => {
    const snapshot = { text: q.text, options: q.options.slice(), correct: q.correct, expl: q.expl };
    setForm(snapshot);
    setFormErrors({});
    initialFormRef.current = snapshot;
    setQModal({ mode: "edit", subIdx, num: q.num });
  };
  const openDuplicateModal = (subIdx, q) => {
    const snapshot = { text: q.text, options: q.options.slice(), correct: q.correct, expl: q.expl };
    setForm(snapshot);
    setFormErrors({});
    // Deliberately does not match `form`'s initial snapshot: a duplicate is
    // pre-filled but still counts as new, unsaved content the admin should
    // be warned about if they try to close without saving.
    initialFormRef.current = EMPTY_FORM;
    setQModal({ mode: "add", subIdx });
    flash("ok", "Duplicated into a new question — edit it, then save.");
  };
  const closeModal = () => { setQModal(null); setForm(EMPTY_FORM); setFormErrors({}); };
  // Routes every close attempt (X button, Cancel, overlay click, Escape)
  // through here so unsaved edits can't be lost with one stray click.
  const requestCloseModal = () => {
    if (isModalDirty) { setConfirmState({ kind: "discardQuestion" }); return; }
    closeModal();
  };

  const submitForm = async () => {
    if (!qModal) return;
    const payload = { ...form, correct: parseInt(form.correct) };
    const errors = {};
    if (!payload.text.trim()) errors.text = true;
    payload.options.forEach((o, i) => { if (!o.trim()) errors[`opt${i}`] = true; });
    if (!payload.expl.trim()) errors.expl = true;
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      flash("err", "Fill in the question, all four options, and an explanation.");
      return;
    }
    const nonEmptyOptions = payload.options.map(o => o.trim().toLowerCase());
    if (new Set(nonEmptyOptions).size !== nonEmptyOptions.length) {
      flash("err", "Two options are identical — check the options before saving.");
      return;
    }
    setFormErrors({});
    setBusy(true);
    
    // MongoDB Migration: Instead of sending an "action" to a generic endpoint,
    // we now handle the category document as a whole.
    const updatedCat = { ...editCat };
    const subcat = updatedCat.subcats[qModal.subIdx];

    if (qModal.mode === "edit") {
      const questionIndex = subcat.questions.findIndex(q => q.num === qModal.num);
      if (questionIndex === -1) {
        setBusy(false);
        flash("err", "Question no longer exists. Refresh the subject and try again.");
        return;
      }
      subcat.questions[questionIndex] = { ...payload, num: qModal.num };
    } else {
      subcat.questions.push({ ...payload, num: subcat.questions.length + 1 });
    }

    const { ok, json: j } = await apiRequest("/api/questions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedCat),
    });
    
    setBusy(false);
    if (!ok) { if (j) flash("err", j.error || "Something went wrong."); return; }
    flash("ok", qModal.mode === "edit" ? "Question updated — saved to MongoDB." : "Question added — saved to MongoDB.");
    closeModal();
    await loadCatQuiet(editCat.id);
    refreshCats();
    refreshDashStats();
  };

  const deleteFromModal = () => {
    if (!qModal || qModal.mode !== "edit") return;
    setConfirmState({ kind: "question", subIdx: qModal.subIdx, num: qModal.num, fromModal: true });
  };

  const requestDeleteQuestion = (subIdx, num) => setConfirmState({ kind: "question", subIdx, num });
  const requestDeleteSubtopic = (subIdx) => setConfirmState({ kind: "subtopic", subIdx });
  const requestDeleteSubject = () => setConfirmState({ kind: "subject" });

  const runConfirm = async () => {
    if (!confirmState) return;
    if (confirmState.kind === "discardQuestion") {
      closeModal();
      setConfirmState(null);
      return;
    }
    setConfirmState(s => ({ ...s, busy: true }));
    if (confirmState.kind === "bulk") {
      const updatedCat = { ...editCat };
      // Group the selected keys by chapter so each chapter's questions are
      // spliced out together, then every chapter is re-numbered.
      const bySubIdx = new Map();
      selectedQs.forEach(k => {
        const [subIdx, num] = k.split("-").map(Number);
        if (!bySubIdx.has(subIdx)) bySubIdx.set(subIdx, new Set());
        bySubIdx.get(subIdx).add(num);
      });
      bySubIdx.forEach((nums, subIdx) => {
        const subcat = updatedCat.subcats[subIdx];
        if (!subcat) return;
        subcat.questions = subcat.questions.filter(q => !nums.has(q.num));
        subcat.questions.forEach((q, i) => { q.num = i + 1; });
      });
      const { ok, json: j } = await apiRequest("/api/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedCat),
      });
      if (!ok) { if (j) flash("err", j.error || "Bulk delete failed."); setConfirmState(null); return; }
      flash("ok", `Deleted ${selectedQs.size} question${selectedQs.size === 1 ? "" : "s"}.`);
      clearSelection();
      await loadCatQuiet(editCat.id);
      refreshCats();
      refreshDashStats();
    } else if (confirmState.kind === "question") {
      // MongoDB Migration: Update the category document by removing the question
      const updatedCat = { ...editCat };
      const subcat = updatedCat.subcats[confirmState.subIdx];
      const questionIndex = subcat.questions.findIndex(q => q.num === confirmState.num);
      if (questionIndex === -1) {
        setConfirmState(null);
        flash("err", "Question no longer exists. Refresh the subject and try again.");
        return;
      }
      subcat.questions.splice(questionIndex, 1);
      // Re-index remaining questions
      subcat.questions.forEach((q, i) => { q.num = i + 1; });

      const { ok, json: j } = await apiRequest("/api/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedCat),
      });
      if (!ok) { if (j) flash("err", j.error || "Delete failed."); setConfirmState(null); return; }
      flash("ok", "Question deleted.");
      if (confirmState.fromModal) closeModal();
      await loadCatQuiet(editCat.id);
      refreshCats();
      refreshDashStats();
    } else if (confirmState.kind === "subtopic") {
      // MongoDB Migration: Remove the subcategory from the document
      const updatedCat = { ...editCat };
      updatedCat.subcats.splice(confirmState.subIdx, 1);

      const { ok, json: j } = await apiRequest("/api/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedCat),
      });
      if (!ok) { if (j) flash("err", j.error || "Delete failed."); setConfirmState(null); return; }
      flash("ok", "Chapter deleted.");
      setActiveChapterIdx(null);
      setPage(1);
      await loadCatQuiet(editCat.id);
      refreshCats();
      refreshDashStats();
    } else if (confirmState.kind === "subject") {
      const { ok, json: j } = await apiRequest(`/api/questions?id=${editCat.id}`, { method: "DELETE" });
      if (!ok) { if (j) flash("err", j.error || "Delete failed."); setConfirmState(null); return; }
      flash("ok", "Subject deleted.");
      setSelectedId(null);
      setEditCat(null);
      refreshCats();
      refreshDashStats();
    }
    setConfirmState(null);
  };

  const saveSubjectMeta = async () => {
    if (!metaForm.title.trim()) { flash("err", "Subject title can't be empty."); return; }
    setBusy(true);
    const updatedCat = { ...editCat, title: metaForm.title, description: metaForm.description, group: metaForm.group };
    const { ok, json: j } = await apiRequest("/api/questions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedCat),
    });
    setBusy(false);
    if (!ok) { if (j) flash("err", j.error || "Update failed."); return; }
    flash("ok", "Subject details saved.");
    loadCat(editCat.id);
    refreshCats();
    refreshDashStats();
  };

  // Discards the in-progress Settings edit and completes whatever tab/subject
  // switch was waiting on it.
  const discardMetaAndNav = () => {
    setMetaForm(savedMetaForm);
    const fn = pendingNav;
    setPendingNav(null);
    fn && fn();
  };
  const cancelPendingNav = () => setPendingNav(null);

  const handleCreateSubject = async () => {
    if (!newSubject.title.trim()) { flash("err", "Give the new subject a title."); return; }
    setBusy(true);
    const payload = {
      id: newSubject.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      title: newSubject.title,
      description: newSubject.description,
      group: newSubject.group,
      subcats: []
    };
    const { ok, json: j } = await apiRequest("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!ok) { if (j) flash("err", j.error || "Could not create subject."); return; }
    flash("ok", `Created "${j.category.title}".`);
    setNewSubject({ title: "", description: "", group: "civil1" });
    setNewSubjectOpen(false);
    await refreshCats();
    refreshDashStats();
    loadCat(j.category.id);
  };

  const handleAddChapter = async () => {
    if (!newChapterName.trim()) { flash("err", "Give the chapter a name."); return; }
    setBusy(true);
    const updatedCat = { ...editCat };
    updatedCat.subcats.push({ name: newChapterName, questions: [] });
    const { ok, json: j } = await apiRequest("/api/questions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedCat),
    });
    setBusy(false);
    if (!ok) { if (j) flash("err", j.error || "Could not add chapter."); return; }
    flash("ok", "Chapter added.");
    setNewChapterName("");
    setNewChapterOpen(false);
    await loadCatQuiet(editCat.id);
    setActiveChapterIdx(updatedCat.subcats.length - 1);
    setPage(1);
    refreshCats();
    refreshDashStats();
  };

  const startRename = (subIdx, currentName) => setRenaming({ subIdx, value: currentName });
  const cancelRename = () => setRenaming(null);
  const submitRename = async () => {
    if (!renaming || !renaming.value.trim()) { flash("err", "Chapter name can't be empty."); return; }
    setBusy(true);
    const { ok, json: j } = await apiRequest("/api/admin/subjects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "renameSubtopic", catId: editCat.id, subIdx: renaming.subIdx, name: renaming.value }),
    });
    setBusy(false);
    if (!ok) { if (j) flash("err", j.error || "Rename failed."); return; }
    flash("ok", "Chapter renamed.");
    setRenaming(null);
    await loadCatQuiet(editCat.id);
    refreshCats();
    refreshDashStats();
  };

  // Shared by the live preview (on file select) and the actual import, so
  // what the admin sees previewed is exactly what gets sent to the server.
  const parseImportText = (text) => {
    let obj;
    try { obj = JSON.parse(text); }
    catch {
      try { obj = Function("return (" + text + ")")(); }
      catch { return null; }
    }
    if (text.includes("window.QUIZ_CATEGORY")) {
      const m = text.match(/window\.\w+\s*=\s*(\{[\s\S]*\});?/);
      if (m) { try { obj = JSON.parse(m[1]); } catch { try { obj = eval("(" + m[1] + ")"); } catch { return null; } } }
    }
    return obj;
  };

  const handleFileChosen = async (file) => {
    setImportFile(file || null);
    if (!file) { setImportPreview(null); return; }
    const text = await file.text();
    const obj = parseImportText(text);
    if (!obj || typeof obj !== "object") { setImportPreview({ error: "That file isn't valid JSON." }); return; }
    const subcats = Array.isArray(obj.subcats) ? obj.subcats : [];
    if (!subcats.length) { setImportPreview({ error: "No chapters/questions found in this file." }); return; }
    const questionCount = subcats.reduce((a, s) => a + (Array.isArray(s.questions) ? s.questions.length : 0), 0);
    setImportPreview({ title: obj.title || "(untitled)", subcats: subcats.length, questions: questionCount });
  };

  const handleImport = async () => {
    if (!importFile) { flash("err", "Choose a JSON file to import first."); return; }
    const text = await importFile.text();
    const obj = parseImportText(text);
    if (!obj) { flash("err", "That file isn't valid JSON."); return; }
    setBusy(true);
    const { ok, json: j } = await apiRequest("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: obj, group: importGroup }),
    });
    setBusy(false);
    if (!ok) { if (j) flash("err", j.error || "Import failed."); return; }
    flash("ok", `Imported "${j.category.title}".`);
    setImportFile(null);
    setImportPreview(null);
    refreshCats();
    refreshDashStats();
  };

  const filteredCats = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return cats;
    return cats.filter(c => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [cats, sidebarSearch]);

  const groupedCats = useMemo(() => {
    const groups = {};
    for (const g of GROUP_ORDER) groups[g] = [];
    filteredCats.forEach(c => { (groups[c.group] ||= []).push(c); });
    return groups;
  }, [filteredCats]);

  const totalQuestionsOf = (cat) => cat.subcats.reduce((a, s) => a + (s.questions?.length ?? s.count ?? 0), 0);

  const overview = useMemo(() => {
    const totalSubjects = cats.length;
    const totalSubtopics = cats.reduce((a, c) => a + c.subcats.length, 0);
    const totalQuestions = cats.reduce((a, c) => a + totalQuestionsOf(c), 0);
    const totalGroups = new Set(cats.map(c => c.group)).size;
    return { totalSubjects, totalSubtopics, totalQuestions, totalGroups };
  }, [cats]);

  // Flattened, filterable, paginated question list for the Content tab.
  // Works across every chapter ("All") or scoped to one — same search box either way.
  const flatQuestions = useMemo(() => {
    if (!editCat) return [];
    let items = [];
    editCat.subcats.forEach((sc, subIdx) => {
      if (activeChapterIdx !== null && subIdx !== activeChapterIdx) return;
      sc.questions.forEach(q => items.push({ ...q, subIdx }));
    });
    const s = qSearch.trim().toLowerCase();
    if (s) items = items.filter(it => it.text.toLowerCase().includes(s) || String(it.num).includes(s));
    if (sortBy === "az") items = [...items].sort((a, b) => a.text.localeCompare(b.text));
    else if (sortBy === "za") items = [...items].sort((a, b) => b.text.localeCompare(a.text));
    return items;
  }, [editCat, activeChapterIdx, qSearch, sortBy]);

  useEffect(() => { setPage(1); setSelectedQs(new Set()); }, [activeChapterIdx, qSearch, selectedId, sortBy]);

  const totalPages = Math.max(1, Math.ceil(flatQuestions.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const p = Math.min(page, totalPages);
    return flatQuestions.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [flatQuestions, page, totalPages]);

  // ---------- Bulk selection (Content tab) ----------
  const qKey = (q) => `${q.subIdx}-${q.num}`;
  const toggleSelectQ = (q) => setSelectedQs(s => {
    const next = new Set(s);
    const k = qKey(q);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });
  const pageAllSelected = pageItems.length > 0 && pageItems.every(q => selectedQs.has(qKey(q)));
  const toggleSelectPage = () => setSelectedQs(s => {
    const next = new Set(s);
    if (pageAllSelected) pageItems.forEach(q => next.delete(qKey(q)));
    else pageItems.forEach(q => next.add(qKey(q)));
    return next;
  });
  const clearSelection = () => setSelectedQs(new Set());
  const requestBulkDelete = () => { if (selectedQs.size) setConfirmState({ kind: "bulk" }); };

  if (loading) return <div className="loading-row"><span className="spinner"></span> Loading…</div>;
  if (!user || user.role !== "admin") return <div className="empty-note">Not authorized.</div>;

  const activeChapter = activeChapterIdx !== null && editCat ? editCat.subcats[activeChapterIdx] : null;
  const modalChapterName = qModal && editCat ? editCat.subcats[qModal.subIdx]?.name : "";

  const goToSubjects = (id) => { setView("subjects"); if (id) guardedNav(() => loadCat(id)); };

  return (
    <>
      <div className="app-header">
        <span className="dwg-tag mono">ADMIN PANEL</span>
        <h1 className="serif">{view === "dashboard" ? "Dashboard" : "Manage Questions"}</h1>
        <p>{view === "dashboard"
          ? "An at-a-glance view of the question bank. Switch to Subjects to add, edit, or remove content."
          : "Create subjects, organize chapters, and add, edit or remove questions. Every change is saved to MongoDB."}</p>
      </div>

      <div className="admin-toplevel-tabs" role="tablist" aria-label="Admin sections">
        <button role="tab" aria-selected={view === "dashboard"} className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Dashboard</button>
        <button role="tab" aria-selected={view === "subjects"} className={view === "subjects" ? "active" : ""} onClick={() => setView("subjects")}>Subjects</button>
      </div>

      <div className="admin-overview">
        <div className="stat-chip"><div className="num serif">{overview.totalSubjects}</div><div className="lab mono">Subjects</div></div>
        <div className="stat-chip"><div className="num serif">{overview.totalSubtopics}</div><div className="lab mono">Chapters</div></div>
        <div className="stat-chip"><div className="num serif">{overview.totalQuestions}</div><div className="lab mono">Questions</div></div>
        {dashStats ? (
          <div className="stat-chip"><div className="num serif">{dashStats.totalUsers}</div><div className="lab mono">Users</div></div>
        ) : (
          <div className="stat-chip"><div className="num serif">{overview.totalGroups}</div><div className="lab mono">Apps Covered</div></div>
        )}
      </div>

      {msg && (
        <div className={`message-banner ${msg.type === "ok" ? "ok" : "err"}`} role="status" aria-live="polite">
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {view === "dashboard" && (
        <div className="dwg-card">
          <div className="admin-panel-sub" style={{ marginBottom: 14 }}>RECENTLY UPDATED SUBJECTS</div>
          {!dashStats ? (
            <div style={{ display: "grid", gap: 8 }}>
              {[0, 1, 2].map(i => <div key={i} className="skeleton skeleton-line w-100" style={{ height: 46, borderRadius: 10 }} />)}
            </div>
          ) : dashStats.recentSubjects?.length ? (
            <div className="recent-list">
              {dashStats.recentSubjects.map(s => (
                <button key={s.id} className="recent-item" onClick={() => goToSubjects(s.id)}>
                  <span className="mono-badge sm">{monogram(s.title)}</span>
                  <span className="sli-text">
                    <span className="sli-title">{s.title}</span>
                    <span className="sli-meta">{GROUP_LABELS[s.group] || s.group} · updated {timeAgo(s.updatedAt)}</span>
                  </span>
                  <span className="recent-arrow">→</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-note">No subjects yet — head to the Subjects tab to create one.</div>
          )}
          <div className="admin-divider" />
          <div className="btn-row" style={{ marginTop: 0 }}>
            <button className="btn small" onClick={() => goToSubjects()}>Manage Subjects</button>
            <button className="btn small secondary" onClick={() => { setView("subjects"); setNewSubjectOpen(true); }}>+ New Subject</button>
          </div>
        </div>
      )}

      {view === "subjects" && (
      <div className="admin-shell">
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        {/* Sidebar */}
        <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="admin-sidebar-head">
            <h3>Subjects ({cats.length})</h3>
            <div className="btn-row" style={{ marginTop: 0 }}>
              <button className="btn small" onClick={() => setNewSubjectOpen(o => !o)}>{newSubjectOpen ? "Cancel" : "+ New"}</button>
              <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close subjects panel">×</button>
            </div>
          </div>

          {newSubjectOpen && (
            <div className="form-panel" style={{ marginBottom: 14 }}>
              <div className="form-panel-head"><span className="fp-title">New subject</span></div>
              <div className="mf-field">
                <label className="mf-label">Title</label>
                <input className="mf-input" placeholder="e.g. Soil Mechanics" value={newSubject.title} onChange={e => setNewSubject({ ...newSubject, title: e.target.value })} />
              </div>
              <div className="mf-field">
                <label className="mf-label">Description</label>
                <input className="mf-input" placeholder="Short description (optional)" value={newSubject.description} onChange={e => setNewSubject({ ...newSubject, description: e.target.value })} />
              </div>
              <div className="mf-field" style={{ marginBottom: 10 }}>
                <label className="mf-label">App / group</label>
                <select className="mf-select" value={newSubject.group} onChange={e => setNewSubject({ ...newSubject, group: e.target.value })}>
                  <option value="civil1">Civil 1</option>
                  <option value="civil2">Civil 2</option>
                  <option value="nontechnical">Non-Technical</option>
                </select>
              </div>
              <div className="btn-row">
                <button className="btn small" disabled={busy} onClick={handleCreateSubject}>{busy ? <span className="spinner"></span> : "Create Subject"}</button>
              </div>
            </div>
          )}

          <div className="admin-search">
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".06em" }}>SEARCH</span>
            <input placeholder="Search subjects…" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} />
          </div>

          <div className="sidebar-scroll">
            <div className="subject-list">
              {!catsLoaded && (
                <div style={{ padding: "4px 0 12px" }}>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="skeleton skeleton-line w-100" style={{ height: 40, marginBottom: 8, borderRadius: 10 }} />
                  ))}
                </div>
              )}
              {catsLoaded && filteredCats.length === 0 && (
                <div className="empty-note" style={{ padding: "16px 0" }}>
                  {sidebarSearch.trim() ? (
                    <>No subjects match &quot;{sidebarSearch}&quot;. <button className="link-btn" onClick={() => setSidebarSearch("")}>Clear search</button></>
                  ) : "No subjects yet — create one to get started."}
                </div>
              )}
              {GROUP_ORDER.filter(g => groupedCats[g] && groupedCats[g].length > 0).map(g => {
                const isCollapsed = !!collapsedGroups[g] && !sidebarSearch.trim();
                const list = groupedCats[g];
                return (
                  <div key={g} className="group-section">
                    <div className={`group-section-head ${!isCollapsed ? "open" : ""}`} onClick={() => toggleGroup(g)}>
                      <div className="gs-left">
                        <span className="gs-chevron">▶</span>
                        <span className="gs-label">{GROUP_LABELS[g] || g}</span>
                      </div>
                      <span className="gs-count">{list.length}</span>
                    </div>
                    {!isCollapsed && (
                      <div className="group-section-body">
                        {list.map(c => (
                          <button key={c.id} className={`subject-list-item ${selectedId === c.id ? "active" : ""}`} onClick={() => guardedNav(() => loadCat(c.id))}>
                            <span className="mono-badge sm">{monogram(c.title)}</span>
                            <span className="sli-text">
                              <span className="sli-title">{c.title}</span>
                              <span className="sli-meta">{c.subcats.length} chapters · {totalQuestionsOf(c)} Qs</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="admin-divider" />
            <div className="admin-sidebar-head" style={{ marginBottom: 8 }}>
              <h3>Import JSON</h3>
            </div>
            <div className="mf-field" style={{ marginBottom: 10 }}>
              <select className="mf-select" value={importGroup} onChange={e => setImportGroup(e.target.value)}>
                <option value="civil1">Civil 1</option>
                <option value="civil2">Civil 2</option>
                <option value="nontechnical">Non-Technical</option>
              </select>
            </div>
            <div className="import-drop" style={{ marginBottom: 10 }}>
              <input type="file" accept=".json,.js,.txt" onChange={e => handleFileChosen(e.target.files[0])} />
            </div>
            {importPreview && (
              importPreview.error ? (
                <div className="import-preview err" style={{ marginBottom: 10 }}>{importPreview.error}</div>
              ) : (
                <div className="import-preview ok" style={{ marginBottom: 10 }}>
                  <strong>{importPreview.title}</strong> · {importPreview.subcats} chapter{importPreview.subcats === 1 ? "" : "s"} · {importPreview.questions} question{importPreview.questions === 1 ? "" : "s"}
                </div>
              )
            )}
            <button className="btn small secondary" style={{ width: "100%" }} disabled={busy || !importFile || importPreview?.error} onClick={handleImport}>{busy ? <span className="spinner"></span> : "Import as New Subject"}</button>
          </div>
        </aside>

        {/* Main */}
        <div className="admin-main">
          <button className="btn small secondary sidebar-toggle" onClick={() => setSidebarOpen(true)}>☰ Subjects</button>
          {!editCat && (
            <div className="dwg-card">
              <div className="empty-note">Select a subject from the list, or create a new one, to start managing its questions.</div>
            </div>
          )}

          {editCat && (
            <>
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <div>
                    <h2 className="admin-panel-title serif">{editCat.title}</h2>
                    <div className="admin-panel-sub" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button className={`copy-chip ${copied ? "copied" : ""}`} onClick={copyId}>{copied ? "Copied ✓" : `ID: ${editCat.id}`}</button>
                      <span>{GROUP_LABELS[editCat.group] || editCat.group} · {totalQuestionsOf(editCat)} questions · {editCat.subcats.length} chapters</span>
                    </div>
                    {editCat.description && <p style={{ marginTop: 10, fontFamily: "Spectral, Georgia, serif", fontSize: 14, color: "var(--muted)" }}>{editCat.description}</p>}
                  </div>
                  <button className="btn small secondary" onClick={() => exportSubject(editCat)}>⭳ Export JSON</button>
                </div>

                <div className="admin-tabs">
                  <button className={activeTab === "content" ? "active" : ""} onClick={() => guardedNav(() => setActiveTab("content"))}>Questions</button>
                  <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")}>
                    Settings{isMetaDirty && <span className="unsaved-dot" title="Unsaved changes" />}
                  </button>
                </div>
              </div>

              {activeTab === "content" && (
                <div className="admin-panel">
                  <div className="admin-panel-sub" style={{ marginBottom: 10 }}>CHAPTERS</div>

                  <div className="chapter-strip">
                    <button className={`chapter-chip ${activeChapterIdx === null ? "active" : ""}`} onClick={() => setActiveChapterIdx(null)}>
                      All chapters <span className="chip-count">{totalQuestionsOf(editCat)}</span>
                    </button>
                    {editCat.subcats.map((sc, i) => (
                      <button key={i} className={`chapter-chip ${activeChapterIdx === i ? "active" : ""}`} onClick={() => setActiveChapterIdx(i)}>
                        {sc.name} <span className="chip-count">{sc.questions.length}</span>
                      </button>
                    ))}
                    <button className="chapter-chip add" onClick={() => setNewChapterOpen(o => !o)}>{newChapterOpen ? "Cancel" : "+ Add chapter"}</button>
                  </div>

                  {newChapterOpen && (
                    <div className="add-subtopic-row" style={{ marginBottom: 14 }}>
                      <input
                        className="mf-input"
                        autoFocus
                        placeholder="New chapter name…"
                        value={newChapterName}
                        onChange={e => setNewChapterName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleAddChapter(); }}
                      />
                      <button className="btn small" disabled={busy} onClick={handleAddChapter}>{busy ? <span className="spinner"></span> : "Add"}</button>
                    </div>
                  )}

                  {activeChapter && (
                    <div className="chapter-toolbar">
                      {renaming && renaming.subIdx === activeChapterIdx ? (
                        <div className="subtopic-rename-row" style={{ flex: 1 }}>
                          <input
                            className="mf-input"
                            autoFocus
                            value={renaming.value}
                            onChange={e => setRenaming({ ...renaming, value: e.target.value })}
                            onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") cancelRename(); }}
                          />
                          <button className="btn small" disabled={busy} onClick={submitRename}>{busy ? <span className="spinner"></span> : "Save"}</button>
                          <button className="btn small ghost" onClick={cancelRename}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>Managing chapter &quot;{activeChapter.name}&quot;</span>
                          <div className="btn-row" style={{ marginTop: 0 }}>
                            <button className="icon-action" onClick={() => startRename(activeChapterIdx, activeChapter.name)}>Rename</button>
                            <button className="icon-action danger" onClick={() => requestDeleteSubtopic(activeChapterIdx)}>Delete Chapter</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="filter-bar">
                    <input
                      className="mf-input filter-search"
                      placeholder={activeChapter ? `Search within "${activeChapter.name}"…` : "Search all questions in this subject…"}
                      value={qSearch}
                      onChange={e => setQSearch(e.target.value)}
                    />
                    <select className="mf-select sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort questions">
                      <option value="num">Sort: # (default)</option>
                      <option value="az">Sort: A–Z</option>
                      <option value="za">Sort: Z–A</option>
                    </select>
                    <button className="btn small" onClick={openAddModal}>+ Add Question</button>
                  </div>

                  {selectedQs.size > 0 && (
                    <div className="bulk-bar">
                      <span className="mono bulk-bar-label">{selectedQs.size} selected</span>
                      <div className="btn-row" style={{ marginTop: 0 }}>
                        <button className="btn small ghost" onClick={clearSelection}>Clear</button>
                        <button className="btn small danger" onClick={requestBulkDelete}>Delete Selected</button>
                      </div>
                    </div>
                  )}

                  {editCat.subcats.length === 0 ? (
                    <div className="empty-note">No chapters yet — add one above to start adding questions.</div>
                  ) : flatQuestions.length === 0 ? (
                    <div className="empty-note">{qSearch ? `No questions match "${qSearch}".` : "No questions here yet."}</div>
                  ) : (
                    <>
                      <div className="table-wrap">
                        <table className="admin-table qtable">
                          <thead>
                            <tr>
                              <th style={{ width: 36 }}>
                                <input type="checkbox" className="qtable-checkbox" checked={pageAllSelected} onChange={toggleSelectPage} aria-label="Select all on this page" />
                              </th>
                              <th style={{ width: 54 }}>#</th>
                              {activeChapterIdx === null && <th style={{ width: 160 }}>Chapter</th>}
                              <th>Question</th>
                              <th style={{ width: 44 }}>Ans</th>
                              <th style={{ width: 150 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageItems.map(q => (
                              <tr key={`${q.subIdx}-${q.num}`} className={`qtable-row ${selectedQs.has(qKey(q)) ? "selected" : ""}`} onClick={() => openEditModal(q.subIdx, q)}>
                                <td onClick={e => e.stopPropagation()}>
                                  <input type="checkbox" className="qtable-checkbox" checked={selectedQs.has(qKey(q))} onChange={() => toggleSelectQ(q)} aria-label={`Select question ${q.num}`} />
                                </td>
                                <td className="mono qtable-num">{q.num}</td>
                                {activeChapterIdx === null && <td className="qtable-chapter">{editCat.subcats[q.subIdx].name}</td>}
                                <td className="qtable-text">{q.text.slice(0, 130)}{q.text.length > 130 ? "…" : ""}</td>
                                <td className="mono qtable-ans">{String.fromCharCode(65 + q.correct)}</td>
                                <td className="qtable-actions" onClick={e => e.stopPropagation()}>
                                  <button className="icon-action" onClick={() => openEditModal(q.subIdx, q)}>Edit</button>
                                  <button className="icon-action" onClick={() => openDuplicateModal(q.subIdx, q)}>Copy</button>
                                  <button className="icon-action danger" onClick={() => requestDeleteQuestion(q.subIdx, q.num)}>Del</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {totalPages > 1 && (
                        <div className="pagination">
                          <button className="btn small ghost" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹ Prev</button>
                          <span className="mono pagination-label">Page {Math.min(page, totalPages)} of {totalPages} · {flatQuestions.length} questions</span>
                          <button className="btn small ghost" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next ›</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === "settings" && (
                <div className="admin-panel">
                  <div className="admin-panel-sub" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    SUBJECT DETAILS
                    {isMetaDirty && <span className="unsaved-badge">Unsaved changes</span>}
                  </div>
                  <div className="subject-meta-grid" style={{ marginBottom: 6 }}>
                    <div className="mf-field">
                      <label className="mf-label">Title</label>
                      <input className="mf-input" value={metaForm.title} onChange={e => setMetaForm({ ...metaForm, title: e.target.value })} />
                    </div>
                    <div className="mf-field">
                      <label className="mf-label">App / group</label>
                      <select className="mf-select" value={metaForm.group} onChange={e => setMetaForm({ ...metaForm, group: e.target.value })}>
                        <option value="civil1">Civil 1</option>
                        <option value="civil2">Civil 2</option>
                        <option value="nontechnical">Non-Technical</option>
                      </select>
                    </div>
                    <div className="mf-field" style={{ gridColumn: "1 / -1" }}>
                      <label className="mf-label">Description</label>
                      <input className="mf-input" value={metaForm.description} onChange={e => setMetaForm({ ...metaForm, description: e.target.value })} />
                    </div>
                  </div>
                  <div className="btn-row">
                    <button className="btn small" disabled={busy || !isMetaDirty} onClick={saveSubjectMeta}>{busy ? <span className="spinner"></span> : "Save Changes"}</button>
                    <button className="btn small ghost" disabled={!isMetaDirty} onClick={() => setMetaForm(savedMetaForm)}>Reset</button>
                  </div>

                  <div className="admin-divider" />

                  <div className="admin-panel-sub" style={{ marginBottom: 12 }}>CHAPTERS ({editCat.subcats.length})</div>
                  <div className="table-wrap" style={{ marginBottom: 4 }}>
                    <table className="admin-table">
                      <thead><tr><th>Chapter</th><th style={{ width: 90 }}>Questions</th><th style={{ width: 150 }}></th></tr></thead>
                      <tbody>
                        {editCat.subcats.map((sc, sIdx) => (
                          <tr key={sIdx}>
                            <td>
                              {renaming && renaming.subIdx === sIdx ? (
                                <div className="subtopic-rename-row">
                                  <input
                                    className="mf-input"
                                    autoFocus
                                    value={renaming.value}
                                    onChange={e => setRenaming({ ...renaming, value: e.target.value })}
                                    onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") cancelRename(); }}
                                  />
                                  <button className="btn small" disabled={busy} onClick={submitRename}>{busy ? <span className="spinner"></span> : "Save"}</button>
                                  <button className="btn small ghost" onClick={cancelRename}>Cancel</button>
                                </div>
                              ) : sc.name}
                            </td>
                            <td className="mono">{sc.questions.length}</td>
                            <td className="qtable-actions">
                              {!(renaming && renaming.subIdx === sIdx) && (
                                <>
                                  <button className="icon-action" onClick={() => startRename(sIdx, sc.name)}>Rename</button>
                                  <button className="icon-action danger" onClick={() => requestDeleteSubtopic(sIdx)}>Delete</button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="admin-divider" />

                  <div className="danger-zone">
                    <div className="danger-zone-title">Danger Zone</div>
                    <p>Permanently deletes &quot;{editCat.title}&quot; and all {totalQuestionsOf(editCat)} of its questions across {editCat.subcats.length} chapters. This can&apos;t be undone.</p>
                    <button className="btn small danger" onClick={requestDeleteSubject}>Delete Subject</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

      <QuestionModal
        open={!!qModal}
        mode={qModal?.mode}
        chapterName={modalChapterName}
        form={form}
        setForm={setForm}
        formErrors={formErrors}
        busy={busy}
        onCancel={requestCloseModal}
        onSubmit={submitForm}
        onDelete={qModal?.mode === "edit" ? deleteFromModal : null}
      />

      <ConfirmDialog
        open={!!confirmState}
        title={
          confirmState?.kind === "subject" ? "Delete subject?" :
          confirmState?.kind === "subtopic" ? "Delete chapter?" :
          confirmState?.kind === "discardQuestion" ? "Discard unsaved question?" :
          confirmState?.kind === "bulk" ? `Delete ${selectedQs.size} question${selectedQs.size === 1 ? "" : "s"}?` :
          "Delete question?"
        }
        message={
          confirmState?.kind === "subject" ? `This permanently removes "${editCat?.title}" and every question in it. This can't be undone.` :
          confirmState?.kind === "subtopic" ? `This permanently removes the chapter${editCat && confirmState.subIdx != null ? ` and its ${editCat.subcats[confirmState.subIdx]?.questions.length ?? 0} question(s)` : ""}. This can't be undone.` :
          confirmState?.kind === "discardQuestion" ? "You've made changes to this question that haven't been saved. Close anyway?" :
          confirmState?.kind === "bulk" ? `This permanently removes the ${selectedQs.size} selected question${selectedQs.size === 1 ? "" : "s"}. This can't be undone.` :
          "This permanently removes the question. This can't be undone."
        }
        confirmLabel={confirmState?.kind === "discardQuestion" ? "Discard" : "Delete"}
        danger={confirmState?.kind !== "discardQuestion"}
        busy={!!confirmState?.busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirmState(null)}
      />

      <ConfirmDialog
        open={!!pendingNav}
        title="Discard unsaved changes?"
        message="This subject's details have edits that haven't been saved yet. Leaving now will discard them."
        confirmLabel="Discard & Continue"
        danger={false}
        onConfirm={discardMetaAndNav}
        onCancel={cancelPendingNav}
      />
    </>
  );
}

function QuestionModal({ open, mode, chapterName, form, setForm, formErrors = {}, busy, onCancel, onSubmit, onDelete }){
  if (!open) return null;
  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onSubmit(); }
  };
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="qmodal-title" onKeyDown={onKeyDown}>
        <div className="modal-head">
          <div>
            <div className="mono modal-eyebrow">{chapterName}</div>
            <h3 id="qmodal-title" className="serif">{mode === "edit" ? "Edit Question" : "New Question"}</h3>
          </div>
          <button className="modal-close" onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div className="mf-field">
            <label className="mf-label">Question text</label>
            <textarea className={`mf-textarea ${formErrors.text ? "mf-error" : ""}`} rows={3} placeholder="Question text" value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} />
          </div>
          <div className="mf-field">
            <label className="mf-label">Options — select the correct one</label>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="mf-option-row">
                <label className="mf-radio">
                  <input type="radio" name="correct" checked={parseInt(form.correct) === i} onChange={() => setForm({ ...form, correct: i })} />
                  <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                </label>
                <input className={`mf-input ${formErrors[`opt${i}`] ? "mf-error" : ""}`} placeholder={`Option ${String.fromCharCode(65 + i)}`} value={form.options[i]} onChange={e => { const o = [...form.options]; o[i] = e.target.value; setForm({ ...form, options: o }); }} />
              </div>
            ))}
          </div>
          <div className="mf-field" style={{ marginBottom: 4 }}>
            <label className="mf-label">Explanation</label>
            <textarea className={`mf-textarea ${formErrors.expl ? "mf-error" : ""}`} rows={2} placeholder="Why this answer is correct" value={form.expl} onChange={e => setForm({ ...form, expl: e.target.value })} />
          </div>
          <div className="mf-hint">Saved permanently to MongoDB · Esc to cancel · Ctrl/Cmd+Enter to save.</div>
        </div>

        <div className="modal-foot">
          {onDelete && <button className="btn small danger" onClick={onDelete}>Delete</button>}
          <div style={{ flex: 1 }} />
          <button className="btn small ghost" onClick={onCancel}>Cancel</button>
          <button className="btn small" disabled={busy} onClick={onSubmit}>{busy ? <span className="spinner"></span> : (mode === "edit" ? "Save Changes" : "Add Question")}</button>
        </div>
      </div>
    </div>
  );
}