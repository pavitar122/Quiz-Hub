"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ConfirmDialog from "@/components/ConfirmDialog";
import { monogram } from "@/lib/badge";

const EMPTY_FORM = { text: "", options: ["", "", "", ""], correct: 0, expl: "" };
const GROUP_LABELS = { civil1: "Civil 1", civil2: "Civil 2", nontechnical: "Non-Technical" };
const GROUP_ORDER = ["civil1", "civil2", "nontechnical"];
const PAGE_SIZE = 12;

export default function AdminPage(){
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cats, setCats] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [catLoading, setCatLoading] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [activeTab, setActiveTab] = useState("questions"); // questions | chapters | settings
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer only

  const [activeChapterIdx, setActiveChapterIdx] = useState(null);
  const [qSearch, setQSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedQs, setSelectedQs] = useState(new Set()); // "subIdx-num"
  const [bulkBusy, setBulkBusy] = useState(false);

  const [qModal, setQModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const [metaForm, setMetaForm] = useState({ title: "", description: "", group: "civil1" });

  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ title: "", description: "", group: "civil1" });

  const [newChapterOpen, setNewChapterOpen] = useState(false);
  const [newChapterName, setNewChapterName] = useState("");
  const [renaming, setRenaming] = useState(null);

  const [importFile, setImportFile] = useState(null);
  const [importGroup, setImportGroup] = useState("civil1");

  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const msgTimer = useRef(null);
  const qSearchRef = useRef(null);
  const sidebarSearchRef = useRef(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) { router.push("/"); return; }
    refreshCats();
  }, [user, loading, router]);

  // Global shortcuts: "/" focuses question search, "n" adds question, Esc closes modal
  useEffect(() => {
    const onKey = (e) => {
      // A confirm dialog (destructive action) is on top — never let shortcuts
      // below it fire (e.g. "n" opening a new-question sheet behind the dialog).
      if (confirmState) return;
      if (e.key === "Escape" && qModal) { requestCloseModal(); return; }
      if (e.key === "Escape" && sidebarOpen) { setSidebarOpen(false); return; }
      const tag = document.activeElement?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (typing || qModal) return;
      if (e.key === "/") { e.preventDefault(); qSearchRef.current?.focus(); }
      if ((e.key === "n" || e.key === "N") && editCat && activeTab === "questions") { e.preventDefault(); openAddModal(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qModal, editCat, activeTab, activeChapterIdx, confirmState, sidebarOpen]);

  const flash = (type, text) => {
    setMsg({ type, text });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 4500);
  };

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

  const refreshCats = () => fetch("/api/questions", { cache: "no-store" }).then(r => r.json()).then(d => setCats(d.categories || []));

  const loadCat = async (id) => {
    setSelectedId(id);
    setActiveTab("questions");
    setActiveChapterIdx(null);
    setQSearch("");
    setPage(1);
    setSelectedQs(new Set());
    setRenaming(null);
    setQModal(null);
    setNewChapterOpen(false);
    setCatLoading(true);
    setSidebarOpen(false); // jump straight to the subject on mobile instead of leaving the drawer open
    try {
      const d = await fetch(`/api/questions?id=${id}`, { cache: "no-store" }).then(r => r.json());
      setEditCat(d.category);
      setMetaForm({ title: d.category?.title || "", description: d.category?.description || "", group: d.category?.group || "civil1" });
    } catch {
      flash("err", "Couldn't load that subject. Check your connection and try again.");
    } finally {
      setCatLoading(false);
    }
  };

  const loadCatQuiet = async (id) => {
    const d = await fetch(`/api/questions?id=${id}`, { cache: "no-store" }).then(r => r.json());
    setEditCat(d.category);
  };

  const toggleGroup = (g) => setCollapsedGroups(s => ({ ...s, [g]: !s[g] }));

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

  // ---------- Question editor (slide-over) ----------
  const initialFormRef = useRef(EMPTY_FORM);
  const isFormDirty = () => JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  const openAddModal = () => {
    if (!editCat?.subcats.length) { flash("err", "Add a chapter first — questions live inside chapters."); setActiveTab("chapters"); setNewChapterOpen(true); return; }
    const subIdx = activeChapterIdx !== null ? activeChapterIdx : 0;
    setForm(EMPTY_FORM);
    initialFormRef.current = EMPTY_FORM;
    setFormError("");
    setQModal({ mode: "add", subIdx });
  };
  const openEditModal = (subIdx, q) => {
    const snapshot = { text: q.text, options: q.options.slice(), correct: q.correct, expl: q.expl };
    setForm(snapshot);
    initialFormRef.current = snapshot;
    setFormError("");
    setQModal({ mode: "edit", subIdx, num: q.num });
  };
  const openDuplicateModal = (subIdx, q) => {
    const snapshot = { text: q.text, options: q.options.slice(), correct: q.correct, expl: q.expl };
    setForm(snapshot);
    // Duplicating pre-fills the form on purpose, so treat that pre-fill as
    // the dirty baseline rather than EMPTY_FORM — otherwise "Cancel" on an
    // untouched duplicate would trigger a "discard changes?" prompt.
    initialFormRef.current = snapshot;
    setFormError("");
    setQModal({ mode: "add", subIdx });
    flash("ok", "Duplicated — edit and save as a new question.");
  };
  const closeModal = () => { setQModal(null); setForm(EMPTY_FORM); setFormError(""); };
  // Used by Cancel, the sheet's backdrop click, and Esc: only interrupt with
  // a confirmation if the person actually changed something.
  const requestCloseModal = () => {
    if (isFormDirty()) { setConfirmState({ kind: "discard" }); return; }
    closeModal();
  };


  const submitForm = async () => {
    if (!qModal) return;
    const payload = { ...form, correct: parseInt(form.correct) };
    if (!payload.text.trim()) { setFormError("Write the question text first."); return; }
    const emptyOpt = payload.options.findIndex(o => !o.trim());
    if (emptyOpt !== -1) { setFormError(`Option ${String.fromCharCode(65 + emptyOpt)} is empty.`); return; }
    if (!payload.expl.trim()) { setFormError("Add a short explanation — learners rely on it."); return; }
    setBusy(true);
    const isEdit = qModal.mode === "edit";
    const body = {
      catId: editCat.id,
      subIdx: qModal.subIdx,
      num: qModal.num,
      data: payload,
      action: isEdit ? "editQuestion" : "addQuestion",
    };
    const { ok, json: j } = await apiRequest("/api/admin/subjects", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!ok) { if (j) setFormError(j.error || "Something went wrong."); return; }
    flash("ok", isEdit ? "Question updated." : "Question added.");
    closeModal();
    await loadCatQuiet(editCat.id);
    refreshCats();
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
    if (confirmState.kind === "discard") { closeModal(); setConfirmState(null); return; }
    setConfirmState(s => ({ ...s, busy: true }));
    if (confirmState.kind === "question") {
      const { ok, json: j } = await apiRequest("/api/admin/subjects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catId: editCat.id, subIdx: confirmState.subIdx, num: confirmState.num }),
      });
      if (!ok) { if (j) flash("err", j.error || "Delete failed."); setConfirmState(null); return; }
      flash("ok", "Question deleted.");
      if (confirmState.fromModal) closeModal();
      setSelectedQs(prev => { const n = new Set(prev); n.delete(`${confirmState.subIdx}-${confirmState.num}`); return n; });
      await loadCatQuiet(editCat.id);
      refreshCats();
    } else if (confirmState.kind === "subtopic") {
      const { ok, json: j } = await apiRequest("/api/admin/subjects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catId: editCat.id, subIdx: confirmState.subIdx, action: "deleteSubtopic" }),
      });
      if (!ok) { if (j) flash("err", j.error || "Delete failed."); setConfirmState(null); return; }
      flash("ok", "Chapter deleted.");
      setActiveChapterIdx(null);
      setPage(1);
      setSelectedQs(new Set());
      await loadCatQuiet(editCat.id);
      refreshCats();
    } else if (confirmState.kind === "subject") {
      const { ok, json: j } = await apiRequest(`/api/admin/subjects?id=${editCat.id}`, { method: "DELETE" });
      if (!ok) { if (j) flash("err", j.error || "Delete failed."); setConfirmState(null); return; }
      flash("ok", "Subject deleted.");
      setSelectedId(null);
      setEditCat(null);
      setSelectedQs(new Set());
      refreshCats();
    } else if (confirmState.kind === "bulk") {
      setBulkBusy(true);
      let failed = 0;
      for (const key of confirmState.keys) {
        const [subIdx, num] = key.split("-").map(Number);
        const { ok } = await apiRequest("/api/admin/subjects", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catId: editCat.id, subIdx, num }),
        });
        if (!ok) failed++;
      }
      setBulkBusy(false);
      if (failed) flash("err", `${failed} deletes failed — the rest were removed.`);
      else flash("ok", `${confirmState.keys.length} questions deleted.`);
      setSelectedQs(new Set());
      await loadCatQuiet(editCat.id);
      refreshCats();
    }
    setConfirmState(null);
  };

  const saveSubjectMeta = async () => {
    if (!metaForm.title.trim()) { flash("err", "Subject title can't be empty."); return; }
    setBusy(true);
    const { ok, json: j } = await apiRequest("/api/admin/subjects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateSubject", catId: editCat.id, title: metaForm.title, description: metaForm.description, group: metaForm.group }),
    });
    setBusy(false);
    if (!ok) { if (j) flash("err", j.error || "Update failed."); return; }
    flash("ok", "Subject details saved.");
    loadCat(editCat.id);
    refreshCats();
  };

  const handleCreateSubject = async () => {
    if (!newSubject.title.trim()) { flash("err", "Give the new subject a title."); return; }
    setBusy(true);
    const { ok, json: j } = await apiRequest("/api/admin/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createSubject", title: newSubject.title, description: newSubject.description, group: newSubject.group }),
    });
    setBusy(false);
    if (!ok) { if (j) flash("err", j.error || "Could not create subject."); return; }
    flash("ok", `Created "${j.category.title}" — now add a chapter.`);
    setNewSubject({ title: "", description: "", group: "civil1" });
    setNewSubjectOpen(false);
    await refreshCats();
    loadCat(j.category.id);
    setActiveTab("chapters");
  };

  const handleAddChapter = async () => {
    if (!newChapterName.trim()) { flash("err", "Give the chapter a name."); return; }
    setBusy(true);
    const { ok, json: j } = await apiRequest("/api/admin/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addSubtopic", catId: editCat.id, name: newChapterName }),
    });
    setBusy(false);
    if (!ok) { if (j) flash("err", j.error || "Could not add chapter."); return; }
    flash("ok", `Chapter "${newChapterName.trim()}" added — now add questions to it.`);
    setNewChapterName("");
    setNewChapterOpen(false);
    await loadCatQuiet(editCat.id);
    setActiveChapterIdx(j.subIdx);
    setActiveTab("questions");
    setPage(1);
    refreshCats();
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
  };

  const handleImport = async () => {
    if (!importFile) { flash("err", "Choose a JSON file to import first."); return; }
    const text = await importFile.text();
    let obj;
    try { obj = JSON.parse(text); }
    catch {
      try { obj = Function("return (" + text + ")")(); }
      catch { flash("err", "That file isn't valid JSON."); return; }
    }
    if (text.includes("window.QUIZ_CATEGORY")) {
      const m = text.match(/window\.\w+\s*=\s*(\{[\s\S]*\});?/);
      if (m) { try { obj = JSON.parse(m[1]); } catch { obj = eval("(" + m[1] + ")"); } }
    }
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
    refreshCats();
  };

  // ---------- derived ----------
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

  const totalQuestionsOf = (cat) => cat?.subcats.reduce((a, s) => a + s.questions.length, 0) || 0;

  const overview = useMemo(() => {
    const totalSubjects = cats.length;
    const totalSubtopics = cats.reduce((a, c) => a + c.subcats.length, 0);
    const totalQuestions = cats.reduce((a, c) => a + totalQuestionsOf(c), 0);
    const totalGroups = new Set(cats.map(c => c.group)).size;
    return { totalSubjects, totalSubtopics, totalQuestions, totalGroups };
  }, [cats]);

  const flatQuestions = useMemo(() => {
    if (!editCat) return [];
    let items = [];
    editCat.subcats.forEach((sc, subIdx) => {
      if (activeChapterIdx !== null && subIdx !== activeChapterIdx) return;
      sc.questions.forEach(q => items.push({ ...q, subIdx }));
    });
    const s = qSearch.trim().toLowerCase();
    if (s) items = items.filter(it => it.text.toLowerCase().includes(s) || String(it.num).includes(s) || it.options.some(o => o.toLowerCase().includes(s)));
    return items;
  }, [editCat, activeChapterIdx, qSearch]);

  useEffect(() => { setPage(1); setSelectedQs(new Set()); }, [activeChapterIdx, qSearch, selectedId]);

  const totalPages = Math.max(1, Math.ceil(flatQuestions.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const p = Math.min(page, totalPages);
    return flatQuestions.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [flatQuestions, page, totalPages]);

  const toggleSelect = (key) => setSelectedQs(prev => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const selectAllOnPage = () => setSelectedQs(prev => {
    const n = new Set(prev);
    pageItems.forEach(q => n.add(`${q.subIdx}-${q.num}`));
    return n;
  });
  const clearSelection = () => setSelectedQs(new Set());

  if (loading) return <div className="loading-row"><span className="spinner"></span> Loading…</div>;
  if (!user || user.role !== "admin") return <div className="empty-note">Not authorized.</div>;

  const activeChapter = activeChapterIdx !== null && editCat ? editCat.subcats[activeChapterIdx] : null;
  const modalChapterName = qModal && editCat ? editCat.subcats[qModal.subIdx]?.name : "";
  const gotoChapterQuestions = (i) => { setActiveChapterIdx(i); setActiveTab("questions"); setPage(1); };

  return (
    <>
      {/* Breadcrumb + hero */}
      <div className="admin-topbar">
        <Link href="/" className="back-link">← Back to app</Link>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button className="admin-sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open subjects list">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
            {editCat ? editCat.title : "Subjects"}
          </button>
          <span className="admin-save-hint">● Auto-saves to disk</span>
        </div>
      </div>
      <div className="admin-hero admin-hero--compact">
        <div>
          <span className="admin-eyebrow">ADMIN · CIVIL HUB</span>
          <h1>Question Studio</h1>
          <p>Pick a subject → manage chapters → add questions. Shortcuts: <kbd>/</kbd> search · <kbd>N</kbd> new question · <kbd>Esc</kbd> close.</p>
        </div>
        <div className="admin-hero-actions">
          <div className="admin-stat-mini"><strong>{overview.totalSubjects}</strong><span>subjects</span></div>
          <div className="admin-stat-mini"><strong>{overview.totalSubtopics}</strong><span>chapters</span></div>
          <div className="admin-stat-mini"><strong>{overview.totalQuestions}</strong><span>questions</span></div>
        </div>
      </div>

      {msg && (
        <div className={`message-banner ${msg.type === "ok" ? "ok" : "err"}`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="admin-shell admin-shell--studio">
        {/* Backdrop for the mobile subjects drawer */}
        {sidebarOpen && <div className="admin-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

        {/* ============ SIDEBAR ============ */}
        <aside className={`admin-sidebar ${sidebarOpen ? "admin-sidebar--open" : ""}`}>
          <div className="admin-sidebar-top">
            <div style={{display:"flex",alignItems:"center"}}>
              <h3>Subjects</h3>
              <span className="admin-sidebar-count">{cats.length}</span>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button className="btn small" onClick={() => setNewSubjectOpen(o => !o)} style={{borderRadius:999}}>{newSubjectOpen ? "Close" : "+ New"}</button>
              <button className="admin-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close subjects list">×</button>
            </div>
          </div>

          {newSubjectOpen && (
            <div className="admin-create-card">
              <div className="admin-create-head">New subject <span className="admin-step-mini">Step 1 of 3</span></div>
              <label className="mf-label">Title *</label>
              <input className="mf-input" autoFocus placeholder="e.g. Soil Mechanics" value={newSubject.title} onChange={e => setNewSubject({ ...newSubject, title: e.target.value })} onKeyDown={e => { if (e.key === "Enter") handleCreateSubject(); }} />
              <label className="mf-label" style={{marginTop:10}}>Description</label>
              <input className="mf-input" placeholder="One-line summary for learners" value={newSubject.description} onChange={e => setNewSubject({ ...newSubject, description: e.target.value })} />
              <label className="mf-label" style={{marginTop:10}}>App / group</label>
              <select className="mf-select" value={newSubject.group} onChange={e => setNewSubject({ ...newSubject, group: e.target.value })}>
                <option value="civil1">Civil 1</option>
                <option value="civil2">Civil 2</option>
                <option value="nontechnical">Non-Technical</option>
              </select>
              <button className="btn small" disabled={busy} onClick={handleCreateSubject} style={{marginTop:12,width:"100%",borderRadius:999}}>{busy ? <span className="spinner"></span> : "Create subject →"}</button>
            </div>
          )}

          <div className="admin-search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input ref={sidebarSearchRef} placeholder="Search subjects…" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} />
            {sidebarSearch && <button className="admin-search-clear" onClick={()=>setSidebarSearch("")} aria-label="Clear subject search">×</button>}
          </div>

          <div className="sidebar-scroll">
            <div className="subject-list">
              {filteredCats.length === 0 && (
                <div className="admin-empty-mini">
                  No subjects found.
                  <button className="btn small secondary" style={{marginTop:8,borderRadius:999}} onClick={()=>{setSidebarSearch(""); setNewSubjectOpen(true);}}>+ Create one</button>
                </div>
              )}
              {filteredCats.length === 0 && sidebarSearch.trim().length > 0 && (
                <div className="admin-empty-mini">
                  No subjects match “{sidebarSearch}”. <button className="btn small secondary" style={{marginTop:8,borderRadius:999}} onClick={()=>{setSidebarSearch(""); setNewSubjectOpen(true);}}>+ Create one</button>
                </div>
              )}
              {GROUP_ORDER.filter(g => groupedCats[g]?.length > 0).map(g => {
                const isCollapsed = !!collapsedGroups[g];
                const list = groupedCats[g];
                return (
                  <div key={g} className="group-section">
                    <button className="group-section-head" onClick={() => toggleGroup(g)}>
                      <span style={{display:"flex",alignItems:"center",gap:6}}>
                        <svg className={`group-chevron ${isCollapsed ? "collapsed" : ""}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        {GROUP_LABELS[g] || g}
                      </span>
                      <span>{list.length}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="group-section-body">
                        {list.map(c => (
                          <button key={c.id} className={`subject-list-item ${selectedId === c.id ? "active" : ""}`} onClick={() => loadCat(c.id)} title={c.title}>
                            <span className="mono-badge sm">{monogram(c.title)}</span>
                            <span className="sli-text">
                              <span className="sli-title">{c.title}</span>
                              <span className="sli-meta">{c.subcats.length} ch · {totalQuestionsOf(c)} Qs</span>
                            </span>
                            {selectedId === c.id && <span className="admin-active-dot" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="admin-import-card">
              <div className="admin-import-head">Import JSON <span className="admin-pill-mini">Bulk</span></div>
              <select className="mf-select" value={importGroup} onChange={e => setImportGroup(e.target.value)} style={{margin:"8px 0"}}>
                <option value="civil1">Civil 1</option>
                <option value="civil2">Civil 2</option>
                <option value="nontechnical">Non-Technical</option>
              </select>
              <label className="admin-dropzone">
                <input type="file" accept=".json,.js,.txt" onChange={e => setImportFile(e.target.files[0])} hidden />
                <span className="admin-dropzone-icon">⭳</span>
                <span className="admin-dropzone-text">{importFile ? importFile.name : "Choose file…"}</span>
              </label>
              <button className="btn small secondary" style={{ width: "100%", marginTop:8, borderRadius:999 }} disabled={busy} onClick={handleImport}>{busy ? <span className="spinner"></span> : "Import subject"}</button>
            </div>
          </div>
        </aside>

        {/* ============ MAIN ============ */}
        <div className={`admin-main ${catLoading ? "admin-main--loading" : ""}`}>
          {catLoading && (
            <div className="admin-main-loading-overlay">
              <span className="spinner"></span>
              <span>Loading subject…</span>
            </div>
          )}
          {!editCat ? (
            <div className="admin-welcome">
              <div className="admin-welcome-icon">✦</div>
              <h2>Select a subject to start</h2>
              <p>Choose on the left, or create a new one. Workflow: <strong>Subject → Chapter → Questions</strong>.</p>
              <div className="admin-welcome-steps">
                <span className="admin-step"><em>1</em> Subject</span>
                <span className="admin-step-arrow">→</span>
                <span className="admin-step"><em>2</em> Chapter</span>
                <span className="admin-step-arrow">→</span>
                <span className="admin-step"><em>3</em> Questions</span>
              </div>
              <button className="btn" style={{marginTop:16,borderRadius:999}} onClick={()=>setNewSubjectOpen(true)}>+ Create subject</button>
            </div>
          ) : (
            <>
              {/* Subject header */}
              <div className="admin-subject-header">
                <div className="admin-subject-left">
                  <div className="admin-subject-avatar">{monogram(editCat.title)}</div>
                  <div style={{minWidth:0,flex:1}}>
                    <h2>{editCat.title} <span className="admin-group-badge">{GROUP_LABELS[editCat.group] || editCat.group}</span></h2>
                    <div className="admin-subject-meta">
                      <button className={`copy-chip ${copied ? "copied" : ""}`} onClick={copyId} title="Copy subject ID">{copied ? "Copied ✓" : editCat.id}</button>
                      <span>{totalQuestionsOf(editCat)} Qs · {editCat.subcats.length} chapters</span>
                    </div>
                    {editCat.description && <p className="admin-subject-desc">{editCat.description}</p>}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexShrink:0}}>
                  <button className="btn small secondary" onClick={() => exportSubject(editCat)} style={{borderRadius:999}}>⭳ Export</button>
                  <button className="btn small" onClick={openAddModal} style={{borderRadius:999}}>+ Question</button>
                </div>
              </div>

              {/* Tabs with counts */}
              <div className="admin-tabs admin-tabs--pill">
                <button className={activeTab === "questions" ? "active" : ""} onClick={() => setActiveTab("questions")}>Questions · {totalQuestionsOf(editCat)}</button>
                <button className={activeTab === "chapters" ? "active" : ""} onClick={() => setActiveTab("chapters")}>Chapters · {editCat.subcats.length}</button>
                <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")}>Settings</button>
              </div>

              {/* ===== QUESTIONS TAB ===== */}
              {activeTab === "questions" && (
                <div className="admin-panel admin-panel--content">
                  <div className="admin-filter-bar admin-filter-bar--sticky">
                    <div className="admin-search-input">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                      <input ref={qSearchRef} placeholder='Search text, option, or #…  ( press / )' value={qSearch} onChange={e => setQSearch(e.target.value)} />
                      {qSearch && <button onClick={()=>setQSearch("")} className="admin-clear" aria-label="Clear question search">×</button>}
                    </div>
                    <select className="mf-select admin-chapter-select" value={activeChapterIdx === null ? "all" : String(activeChapterIdx)} onChange={e => { setActiveChapterIdx(e.target.value === "all" ? null : Number(e.target.value)); }}>
                      <option value="all">All chapters ({totalQuestionsOf(editCat)})</option>
                      {editCat.subcats.map((sc, i) => <option key={i} value={String(i)}>{sc.name} ({sc.questions.length})</option>)}
                    </select>
                  </div>

                  {activeChapter && (
                    <div className="chapter-toolbar chapter-toolbar--card">
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span className="mono-badge sm">{activeChapterIdx+1}</span>
                        <strong style={{fontFamily:"Outfit,sans-serif",fontSize:14}}>{activeChapter.name}</strong>
                        <span style={{fontSize:12,color:"var(--muted-foreground)"}}>· {activeChapter.questions.length} Qs</span>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        {renaming?.subIdx === activeChapterIdx ? (
                          <div className="admin-rename-row">
                            <input className="mf-input" autoFocus value={renaming.value} onChange={e => setRenaming({ ...renaming, value: e.target.value })} onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") cancelRename(); }} />
                            <button className="btn small" disabled={busy} onClick={submitRename} style={{borderRadius:999}}>Save</button>
                            <button className="btn small ghost" onClick={cancelRename}>Cancel</button>
                          </div>
                        ) : (
                          <>
                            <button className="btn small secondary" onClick={() => startRename(activeChapterIdx, activeChapter.name)} style={{borderRadius:999}}>Rename</button>
                            <button className="btn small ghost" onClick={() => requestDeleteSubtopic(activeChapterIdx)} style={{color:"var(--wrong)",borderRadius:999}}>Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="admin-results-meta">
                    <span>{flatQuestions.length} {flatQuestions.length===1?"question":"questions"}{activeChapter ? ` in "${activeChapter.name}"` : ""}</span>
                    <span style={{display:"flex",gap:8,alignItems:"center"}}>
                      {qSearch && <button className="admin-clear-filter" onClick={()=>setQSearch("")}>Clear</button>}
                      {pageItems.length > 0 && <button className="admin-clear-filter" onClick={selectAllOnPage}>Select page</button>}
                      {selectedQs.size > 0 && <button className="admin-clear-filter" onClick={clearSelection}>Deselect ({selectedQs.size})</button>}
                    </span>
                  </div>

                  {/* Bulk action bar */}
                  {selectedQs.size > 0 && (
                    <div className="admin-bulkbar">
                      <strong>{selectedQs.size} selected</strong>
                      <span style={{flex:1}} />
                      <button className="btn small ghost" onClick={clearSelection} style={{borderRadius:999}}>Cancel</button>
                      <button className="btn small danger" disabled={bulkBusy} onClick={()=>setConfirmState({kind:"bulk", keys:[...selectedQs]})} style={{borderRadius:999}}>{bulkBusy ? <span className="spinner" /> : `Delete ${selectedQs.size}`}</button>
                    </div>
                  )}

                  {editCat.subcats.length === 0 ? (
                    <div className="admin-empty">
                      <div style={{fontSize:28,marginBottom:8}}>📂</div>
                      <h3>No chapters yet</h3>
                      <p>Questions live inside chapters. Create one to unlock question creation.</p>
                      <button className="btn small" onClick={()=>{setActiveTab("chapters"); setNewChapterOpen(true);}} style={{marginTop:10,borderRadius:999}}>+ Create first chapter</button>
                    </div>
                  ) : flatQuestions.length === 0 ? (
                    <div className="admin-empty">
                      <h3>{qSearch ? `No match for "${qSearch}"` : "No questions here yet."}</h3>
                      <p>{qSearch ? "Try another term, another chapter, or clear search." : "Add your first question to this chapter."}</p>
                      {!qSearch && <button className="btn small" onClick={openAddModal} style={{marginTop:10,borderRadius:999}}>+ Add question (N)</button>}
                    </div>
                  ) : (
                    <>
                      <div className="admin-q-list">
                        {pageItems.map(q => {
                          const key = `${q.subIdx}-${q.num}`;
                          const checked = selectedQs.has(key);
                          return (
                            <div key={key} className={`admin-q-card ${checked ? "selected" : ""}`} onClick={() => openEditModal(q.subIdx, q)} style={{borderColor: checked ? "var(--primary)" : "var(--border)"}}>
                              <div className="admin-q-top">
                                <input type="checkbox" checked={checked} onChange={()=>toggleSelect(key)} onClick={e=>e.stopPropagation()} className="admin-q-check" title="Select for bulk delete" />
                                <span className="admin-q-num">#{q.num}</span>
                                {activeChapterIdx === null && <button className="admin-q-chapter" onClick={(e)=>{e.stopPropagation(); gotoChapterQuestions(q.subIdx);}} title="Filter to this chapter">{editCat.subcats[q.subIdx].name}</button>}
                                <span className="admin-q-ans">Ans {String.fromCharCode(65 + q.correct)}</span>
                              </div>
                              <p className="admin-q-text">{q.text}</p>
                              <div className="admin-q-opts">{q.options.map((o,i)=><span key={i} className={i===q.correct?"ok":""}>{String.fromCharCode(65+i)}. {o.slice(0,60)}{o.length>60?"…":""}</span>)}</div>
                              <div className="admin-q-actions" onClick={e => e.stopPropagation()}>
                                <button className="btn small secondary" onClick={() => openEditModal(q.subIdx, q)} style={{borderRadius:999}}>Edit</button>
                                <button className="btn small ghost" onClick={() => openDuplicateModal(q.subIdx, q)} style={{borderRadius:999}}>Duplicate</button>
                                <button className="btn small ghost" onClick={() => requestDeleteQuestion(q.subIdx, q.num)} style={{color:"var(--wrong)",borderRadius:999}}>Delete</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {totalPages > 1 && (
                        <div className="pagination pagination--pill">
                          <button className="btn small ghost" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{borderRadius:999}}>‹ Prev</button>
                          <span className="mono pagination-label">Page {Math.min(page, totalPages)} / {totalPages} · {flatQuestions.length}</span>
                          <button className="btn small ghost" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{borderRadius:999}}>Next ›</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ===== CHAPTERS TAB ===== */}
              {activeTab === "chapters" && (
                <div className="admin-panel">
                  <div className="admin-section-head">
                    <span>Chapters · {editCat.subcats.length} · {totalQuestionsOf(editCat)} questions</span>
                    <button className="btn small" onClick={() => setNewChapterOpen(o => !o)} style={{borderRadius:999}}>{newChapterOpen ? "Cancel" : "+ New chapter"}</button>
                  </div>
                  {newChapterOpen && (
                    <div className="admin-inline-add">
                      <input className="mf-input" autoFocus placeholder="Chapter name, e.g. Foundations…" value={newChapterName} onChange={e => setNewChapterName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAddChapter(); }} />
                      <button className="btn small" disabled={busy} onClick={handleAddChapter} style={{borderRadius:999}}>{busy ? <span className="spinner"></span> : "Add chapter"}</button>
                    </div>
                  )}
                  {editCat.subcats.length === 0 ? (
                    <div className="admin-empty">
                      <div style={{fontSize:28}}>📂</div>
                      <h3>Create your first chapter</h3>
                      <p>Chapters group questions (e.g. “Soil Mechanics → Compaction”).</p>
                    </div>
                  ) : (
                    <div className="admin-chapter-grid">
                      {editCat.subcats.map((sc, sIdx) => (
                        <div key={sIdx} className={`admin-chapter-card ${activeChapterIdx===sIdx?"active":""}`}>
                          {renaming?.subIdx === sIdx ? (
                            <div className="admin-rename-row">
                              <input className="mf-input" autoFocus value={renaming.value} onChange={e => setRenaming({ ...renaming, value: e.target.value })} onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") cancelRename(); }} />
                              <button className="btn small" disabled={busy} onClick={submitRename} style={{borderRadius:999}}>Save</button>
                              <button className="btn small ghost" onClick={cancelRename}>✕</button>
                            </div>
                          ) : (
                            <>
                              <div className="admin-chapter-card-top">
                                <span className="mono-badge sm">{sIdx+1}</span>
                                <strong style={{flex:1,fontFamily:"Outfit,sans-serif",fontSize:14}}>{sc.name}</strong>
                                <span className="admin-chapter-count">{sc.questions.length} Qs</span>
                              </div>
                              <div className="admin-chapter-bar"><div style={{width: editCat.subcats.length ? Math.min(100, Math.round(sc.questions.length/Math.max(1,Math.max(...editCat.subcats.map(x=>x.questions.length)))*100))+"%" : "0%"}} /></div>
                              <div style={{display:"flex",gap:6,marginTop:10}}>
                                <button className="btn small secondary" onClick={()=>gotoChapterQuestions(sIdx)} style={{flex:1,borderRadius:999}}>Open →</button>
                                <button className="btn small ghost" onClick={() => startRename(sIdx, sc.name)} style={{borderRadius:999}}>Rename</button>
                                <button className="btn small ghost" onClick={() => requestDeleteSubtopic(sIdx)} style={{color:"var(--wrong)",borderRadius:999}}>Del</button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      <button className="admin-chapter-add" onClick={()=>setNewChapterOpen(true)}>
                        <span style={{fontSize:20}}>+</span>
                        <span>New chapter</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ===== SETTINGS TAB ===== */}
              {activeTab === "settings" && (
                <div className="admin-settings-grid">
                  <div className="admin-panel">
                    <h3 className="admin-section-title">Subject details</h3>
                    <div className="mf-field">
                      <label className="mf-label">Title *</label>
                      <input className="mf-input" value={metaForm.title} onChange={e => setMetaForm({ ...metaForm, title: e.target.value })} placeholder="e.g. Soil Mechanics" />
                    </div>
                    <div className="mf-field">
                      <label className="mf-label">App / group</label>
                      <select className="mf-select" value={metaForm.group} onChange={e => setMetaForm({ ...metaForm, group: e.target.value })}>
                        <option value="civil1">Civil 1</option>
                        <option value="civil2">Civil 2</option>
                        <option value="nontechnical">Non-Technical</option>
                      </select>
                    </div>
                    <div className="mf-field">
                      <label className="mf-label">Description</label>
                      <input className="mf-input" value={metaForm.description} onChange={e => setMetaForm({ ...metaForm, description: e.target.value })} placeholder="One-line summary" />
                    </div>
                    <div className="btn-row">
                      <button className="btn small" disabled={busy} onClick={saveSubjectMeta} style={{borderRadius:999}}>{busy ? <span className="spinner"></span> : "Save changes"}</button>
                      <button className="btn small ghost" onClick={() => setMetaForm({ title: editCat.title, description: editCat.description, group: editCat.group })} style={{borderRadius:999}}>Reset</button>
                    </div>
                  </div>
                  <div>
                    <div className="admin-panel">
                      <h3 className="admin-section-title">Quick actions</h3>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        <button className="btn small secondary" onClick={() => exportSubject(editCat)} style={{borderRadius:999,justifyContent:"center"}}>⭳ Export JSON backup</button>
                        <button className={`copy-chip ${copied ? "copied" : ""}`} onClick={copyId} style={{justifyContent:"center"}}>{copied ? "Copied ✓" : `Copy ID: ${editCat.id}`}</button>
                        <div style={{fontSize:12,color:"var(--muted-foreground)",fontFamily:"Figtree,sans-serif"}}>{totalQuestionsOf(editCat)} questions · {editCat.subcats.length} chapters · saves instantly to disk</div>
                      </div>
                    </div>
                    <div className="danger-zone">
                      <div className="danger-zone-title">Danger Zone</div>
                      <p>Permanently deletes “{editCat.title}” and all {totalQuestionsOf(editCat)} questions. This can’t be undone — export a backup first.</p>
                      <button className="btn small danger" onClick={requestDeleteSubject} style={{borderRadius:999}}>Delete subject</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <QuestionSlideOver
        open={!!qModal}
        mode={qModal?.mode}
        chapterName={modalChapterName}
        chapterIdx={qModal?.subIdx}
        chapterCount={editCat?.subcats.length || 0}
        form={form}
        setForm={setForm}
        error={formError}
        busy={busy}
        dirty={qModal ? isFormDirty() : false}
        onCancel={requestCloseModal}
        onSubmit={submitForm}
        onDelete={qModal?.mode === "edit" ? deleteFromModal : null}
      />

      <ConfirmDialog
        open={!!confirmState}
        title={
          confirmState?.kind === "subject" ? "Delete subject?" :
          confirmState?.kind === "subtopic" ? "Delete chapter?" :
          confirmState?.kind === "bulk" ? `Delete ${confirmState?.keys?.length} questions?` :
          confirmState?.kind === "discard" ? "Discard changes?" : "Delete question?"
        }
        message={
          confirmState?.kind === "subject" ? `This permanently removes "${editCat?.title}" and every question in it. Export a backup first — this can't be undone.` :
          confirmState?.kind === "subtopic" ? "This permanently removes the chapter and all questions inside it. This can't be undone." :
          confirmState?.kind === "bulk" ? "Selected questions will be permanently removed. This can't be undone." :
          confirmState?.kind === "discard" ? "You have unsaved edits on this question. Discard them?" :
          "This permanently removes the question. This can't be undone."
        }
        confirmLabel={confirmState?.kind === "bulk" ? `Delete ${confirmState?.keys?.length}` : confirmState?.kind === "discard" ? "Discard" : "Delete"}
        danger={confirmState?.kind !== "discard"}
        busy={!!confirmState?.busy || bulkBusy}
        onConfirm={runConfirm}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
}

function QuestionSlideOver({ open, mode, chapterName, chapterIdx, chapterCount, form, setForm, error, busy, dirty, onCancel, onSubmit, onDelete }){
  const filledOpts = form.options.filter(o => o.trim()).length;
  if (!open) return null;
  return (
    <div className="admin-sheet-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="admin-sheet" role="dialog" aria-modal="true" aria-labelledby="qsheet-title">
        <div className="admin-sheet-head">
          <div>
            <div className="admin-sheet-eyebrow">{chapterName} {typeof chapterIdx === "number" ? `· Ch ${chapterIdx+1}/${chapterCount}` : ""}</div>
            <h3 id="qsheet-title">{mode === "edit" ? "Edit question" : "New question"}</h3>
            <div className="admin-sheet-sub">{filledOpts}/4 options · {form.text.trim().length} chars · Ctrl+Enter to save</div>
          </div>
          <button className="modal-close" onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className="admin-sheet-body">
          {error && <div className="admin-form-error">{error}</div>}
          <div className="mf-field">
            <label className="mf-label">Question *</label>
            <textarea className="mf-textarea" autoFocus rows={3} placeholder="e.g. Which soil has the highest permeability?" value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSubmit(); }} />
          </div>
          <div className="mf-field">
            <label className="mf-label">Options — click a letter to mark correct *</label>
            <div className="admin-opts">
              {[0, 1, 2, 3].map(i => {
                const isCorrect = parseInt(form.correct) === i;
                return (
                  <div key={i} className={`admin-opt ${isCorrect ? "correct" : ""}`}>
                    <button type="button" className={`admin-opt-letter ${isCorrect ? "correct" : ""}`} onClick={() => setForm({ ...form, correct: i })} title={isCorrect ? "Correct answer" : "Mark as correct"}>{String.fromCharCode(65 + i)}</button>
                    <input className="mf-input" placeholder={`Option ${String.fromCharCode(65 + i)}…`} value={form.options[i]} onChange={e => { const o = [...form.options]; o[i] = e.target.value; setForm({ ...form, options: o }); }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSubmit(); }} />
                    {isCorrect && <span className="admin-opt-badge">✓ Correct</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mf-field">
            <label className="mf-label">Explanation * <span>(shown after answering)</span></label>
            <textarea className="mf-textarea" rows={3} placeholder="Why is this correct? 1–2 lines." value={form.expl} onChange={e => setForm({ ...form, expl: e.target.value })} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSubmit(); }} />
          </div>
          <div className="mf-hint mf-hint--actions">
            <span>Saves instantly to disk</span>
            <span className="mf-hint-btns">
              <button type="button" className="btn small ghost" onClick={onCancel} style={{borderRadius:999}}>Cancel <kbd>Esc</kbd></button>
              <button type="button" className="btn small" disabled={busy} onClick={onSubmit} style={{borderRadius:999}}>{busy ? <span className="spinner"></span> : <>{mode === "edit" ? "Save changes" : "Add question"} <kbd>Ctrl+↵</kbd></>}</button>
            </span>
          </div>
        </div>

        <div className="admin-sheet-foot">
          {onDelete ? <button className="btn small danger" onClick={onDelete} style={{borderRadius:999}}>Delete</button> : <span />}
          <div style={{ flex: 1 }} />
          {dirty && <span className="admin-sheet-dirty">● Unsaved changes</span>}
          <button className="btn small ghost" onClick={onCancel} style={{borderRadius:999}}>Cancel</button>
          <button className="btn small" disabled={busy} onClick={onSubmit} style={{borderRadius:999}}>{busy ? <span className="spinner"></span> : (mode === "edit" ? "Save changes" : "Add question")}</button>
        </div>
      </div>
    </div>
  );
}