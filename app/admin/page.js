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

export default function AdminPage(){
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cats, setCats] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [activeTab, setActiveTab] = useState("content"); // 'content' | 'settings'

  // Chapter (subtopic) + question browsing state
  const [activeChapterIdx, setActiveChapterIdx] = useState(null); // null = "All chapters"
  const [qSearch, setQSearch] = useState("");
  const [page, setPage] = useState(1);

  // Question modal: { mode:'add'|'edit', subIdx, num? }
  const [qModal, setQModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [metaForm, setMetaForm] = useState({ title: "", description: "", group: "civil1" });

  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ title: "", description: "", group: "civil1" });

  const [newChapterOpen, setNewChapterOpen] = useState(false);
  const [newChapterName, setNewChapterName] = useState("");
  const [renaming, setRenaming] = useState(null); // { subIdx, value }

  const [importFile, setImportFile] = useState(null);
  const [importGroup, setImportGroup] = useState("civil1");

  const [msg, setMsg] = useState(null); // { type:'ok'|'err', text }
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmState, setConfirmState] = useState(null); // { kind, subIdx, num, busy }
  const msgTimer = useRef(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) { router.push("/"); return; }
    refreshCats();
  }, [user, loading]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && qModal) closeModal(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qModal]);

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

  const refreshCats = () => fetch("/api/questions", { cache: "no-store" }).then(r => r.json()).then(d => setCats(d.categories || []));

  const loadCat = async (id) => {
    setSelectedId(id);
    setActiveTab("content");
    setActiveChapterIdx(null);
    setQSearch("");
    setPage(1);
    setRenaming(null);
    setQModal(null);
    setNewChapterOpen(false);
    const d = await fetch(`/api/questions?id=${id}`, { cache: "no-store" }).then(r => r.json());
    setEditCat(d.category);
    setMetaForm({ title: d.category?.title || "", description: d.category?.description || "", group: d.category?.group || "civil1" });
  };

  // like loadCat but keeps chapter/page/search state, for smooth in-place edits
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

  // ---------- Question modal ----------
  const openAddModal = () => {
    if (!editCat.subcats.length) { flash("err", "Add a chapter first."); return; }
    const subIdx = activeChapterIdx !== null ? activeChapterIdx : 0;
    setForm(EMPTY_FORM);
    setQModal({ mode: "add", subIdx });
  };
  const openEditModal = (subIdx, q) => {
    setForm({ text: q.text, options: q.options.slice(), correct: q.correct, expl: q.expl });
    setQModal({ mode: "edit", subIdx, num: q.num });
  };
  const openDuplicateModal = (subIdx, q) => {
    setForm({ text: q.text, options: q.options.slice(), correct: q.correct, expl: q.expl });
    setQModal({ mode: "add", subIdx });
    flash("ok", "Duplicated into a new question — edit it, then save.");
  };
  const closeModal = () => { setQModal(null); setForm(EMPTY_FORM); };

  const submitForm = async () => {
    if (!qModal) return;
    const payload = { ...form, correct: parseInt(form.correct) };
    if (!payload.text.trim() || payload.options.some(o => !o.trim()) || !payload.expl.trim()) {
      flash("err", "Fill in the question, all four options, and an explanation.");
      return;
    }
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
    if (!ok) { if (j) flash("err", j.error || "Something went wrong."); return; }
    flash("ok", isEdit ? "Question updated — saved to the data file." : "Question added — saved to the data file.");
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
      await loadCatQuiet(editCat.id);
      refreshCats();
    } else if (confirmState.kind === "subject") {
      const { ok, json: j } = await apiRequest(`/api/admin/subjects?id=${editCat.id}`, { method: "DELETE" });
      if (!ok) { if (j) flash("err", j.error || "Delete failed."); setConfirmState(null); return; }
      flash("ok", "Subject deleted.");
      setSelectedId(null);
      setEditCat(null);
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
    flash("ok", `Created "${j.category.title}".`);
    setNewSubject({ title: "", description: "", group: "civil1" });
    setNewSubjectOpen(false);
    await refreshCats();
    loadCat(j.category.id);
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
    flash("ok", "Chapter added.");
    setNewChapterName("");
    setNewChapterOpen(false);
    await loadCatQuiet(editCat.id);
    setActiveChapterIdx(j.subIdx);
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

  const totalQuestionsOf = (cat) => cat.subcats.reduce((a, s) => a + s.questions.length, 0);

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
    return items;
  }, [editCat, activeChapterIdx, qSearch]);

  useEffect(() => { setPage(1); }, [activeChapterIdx, qSearch, selectedId]);

  const totalPages = Math.max(1, Math.ceil(flatQuestions.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const p = Math.min(page, totalPages);
    return flatQuestions.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [flatQuestions, page, totalPages]);

  if (loading) return <div className="loading-row"><span className="spinner"></span> Loading…</div>;
  if (!user || user.role !== "admin") return <div className="empty-note">Not authorized.</div>;

  const activeChapter = activeChapterIdx !== null && editCat ? editCat.subcats[activeChapterIdx] : null;
  const modalChapterName = qModal && editCat ? editCat.subcats[qModal.subIdx]?.name : "";

  return (
    <>
      <div className="app-header">
        <span className="dwg-tag mono">ADMIN PANEL</span>
        <h1 className="serif">Manage Questions</h1>
        <p>Create subjects, organize chapters, and add, edit or remove questions. Every change writes straight to the subject's data file on disk.</p>
      </div>

      <div className="admin-overview">
        <div className="stat-chip"><div className="num serif">{overview.totalSubjects}</div><div className="lab mono">Subjects</div></div>
        <div className="stat-chip"><div className="num serif">{overview.totalSubtopics}</div><div className="lab mono">Chapters</div></div>
        <div className="stat-chip"><div className="num serif">{overview.totalQuestions}</div><div className="lab mono">Questions</div></div>
        <div className="stat-chip"><div className="num serif">{overview.totalGroups}</div><div className="lab mono">Apps Covered</div></div>
      </div>

      {msg && (
        <div className={`message-banner ${msg.type === "ok" ? "ok" : "err"}`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="admin-shell">
        {/* Sidebar */}
        <aside className="admin-sidebar">
          <div className="admin-sidebar-head">
            <h3>Subjects ({cats.length})</h3>
            <button className="btn small" onClick={() => setNewSubjectOpen(o => !o)}>{newSubjectOpen ? "Cancel" : "+ New"}</button>
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
              {filteredCats.length === 0 && <div className="empty-note" style={{ padding: "16px 0" }}>No subjects found.</div>}
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
                          <button key={c.id} className={`subject-list-item ${selectedId === c.id ? "active" : ""}`} onClick={() => loadCat(c.id)}>
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
              <input type="file" accept=".json,.js,.txt" onChange={e => setImportFile(e.target.files[0])} />
            </div>
            <button className="btn small secondary" style={{ width: "100%" }} disabled={busy} onClick={handleImport}>{busy ? <span className="spinner"></span> : "Import as New Subject"}</button>
          </div>
        </aside>

        {/* Main */}
        <div className="admin-main">
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
                  <button className={activeTab === "content" ? "active" : ""} onClick={() => setActiveTab("content")}>Questions</button>
                  <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")}>Settings</button>
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
                          <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>Managing chapter "{activeChapter.name}"</span>
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
                    <button className="btn small" onClick={openAddModal}>+ Add Question</button>
                  </div>

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
                              <th style={{ width: 54 }}>#</th>
                              {activeChapterIdx === null && <th style={{ width: 160 }}>Chapter</th>}
                              <th>Question</th>
                              <th style={{ width: 44 }}>Ans</th>
                              <th style={{ width: 150 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageItems.map(q => (
                              <tr key={`${q.subIdx}-${q.num}`} className="qtable-row" onClick={() => openEditModal(q.subIdx, q)}>
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
                  <div className="admin-panel-sub" style={{ marginBottom: 14 }}>SUBJECT DETAILS</div>
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
                    <button className="btn small" disabled={busy} onClick={saveSubjectMeta}>{busy ? <span className="spinner"></span> : "Save Changes"}</button>
                    <button className="btn small ghost" onClick={() => setMetaForm({ title: editCat.title, description: editCat.description, group: editCat.group })}>Reset</button>
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
                    <p>Permanently deletes "{editCat.title}" and all {totalQuestionsOf(editCat)} of its questions across {editCat.subcats.length} chapters. This can't be undone.</p>
                    <button className="btn small danger" onClick={requestDeleteSubject}>Delete Subject</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <QuestionModal
        open={!!qModal}
        mode={qModal?.mode}
        chapterName={modalChapterName}
        form={form}
        setForm={setForm}
        busy={busy}
        onCancel={closeModal}
        onSubmit={submitForm}
        onDelete={qModal?.mode === "edit" ? deleteFromModal : null}
      />

      <ConfirmDialog
        open={!!confirmState}
        title={
          confirmState?.kind === "subject" ? "Delete subject?" :
          confirmState?.kind === "subtopic" ? "Delete chapter?" : "Delete question?"
        }
        message={
          confirmState?.kind === "subject" ? `This permanently removes "${editCat?.title}" and every question in it. This can't be undone.` :
          confirmState?.kind === "subtopic" ? "This permanently removes the chapter and all questions inside it. This can't be undone." :
          "This permanently removes the question. This can't be undone."
        }
        confirmLabel="Delete"
        busy={!!confirmState?.busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
}

function QuestionModal({ open, mode, chapterName, form, setForm, busy, onCancel, onSubmit, onDelete }){
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="qmodal-title">
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
            <textarea className="mf-textarea" rows={3} placeholder="Question text" value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} />
          </div>
          <div className="mf-field">
            <label className="mf-label">Options — select the correct one</label>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="mf-option-row">
                <label className="mf-radio">
                  <input type="radio" name="correct" checked={parseInt(form.correct) === i} onChange={() => setForm({ ...form, correct: i })} />
                  <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                </label>
                <input className="mf-input" placeholder={`Option ${String.fromCharCode(65 + i)}`} value={form.options[i]} onChange={e => { const o = [...form.options]; o[i] = e.target.value; setForm({ ...form, options: o }); }} />
              </div>
            ))}
          </div>
          <div className="mf-field" style={{ marginBottom: 4 }}>
            <label className="mf-label">Explanation</label>
            <textarea className="mf-textarea" rows={2} placeholder="Why this answer is correct" value={form.expl} onChange={e => setForm({ ...form, expl: e.target.value })} />
          </div>
          <div className="mf-hint">Saved permanently to the subject's data file · press Esc to cancel.</div>
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