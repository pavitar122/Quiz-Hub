"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { monogram } from "@/lib/badge";

const EMPTY_FORM = { text: "", options: ["", "", "", ""], correct: 0, expl: "" };
const GROUP_LABELS = { civil1: "Civil 1", civil2: "Civil 2", nontechnical: "Non-Technical" };
const GROUP_ORDER = ["civil1", "civil2", "nontechnical"];

export default function AdminPage(){
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cats, setCats] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [openSubs, setOpenSubs] = useState({}); // { [subIdx]: bool }
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [activeTab, setActiveTab] = useState("content"); // 'content' | 'settings'

  const [formMode, setFormMode] = useState(null); // { type: 'add'|'edit', subIdx, num? }
  const [form, setForm] = useState(EMPTY_FORM);
  const [qSearch, setQSearch] = useState({}); // { [subIdx]: string }

  const [metaForm, setMetaForm] = useState({ title: "", description: "", group: "civil1" });

  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ title: "", description: "", group: "civil1" });

  const [newSubtopicName, setNewSubtopicName] = useState("");
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
    const onKey = (e) => { if (e.key === "Escape" && formMode) cancelForm(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formMode]);

  const flash = (type, text) => {
    setMsg({ type, text });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 4500);
  };

  const refreshCats = () => fetch("/api/questions").then(r => r.json()).then(d => setCats(d.categories || []));

  const loadCat = async (id) => {
    setSelectedId(id);
    setFormMode(null);
    setActiveTab("content");
    setOpenSubs({});
    setRenaming(null);
    setQSearch({});
    const d = await fetch(`/api/questions?id=${id}`).then(r => r.json());
    setEditCat(d.category);
    setMetaForm({ title: d.category?.title || "", description: d.category?.description || "", group: d.category?.group || "civil1" });
  };

  const toggleSub = (i) => setOpenSubs(s => ({ ...s, [i]: !s[i] }));
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

  const startAdd = (subIdx) => {
    setForm(EMPTY_FORM);
    setFormMode({ type: "add", subIdx });
    setOpenSubs(s => ({ ...s, [subIdx]: true }));
  };
  const startEdit = (subIdx, q) => {
    setForm({ text: q.text, options: q.options.slice(), correct: q.correct, expl: q.expl });
    setFormMode({ type: "edit", subIdx, num: q.num });
    setOpenSubs(s => ({ ...s, [subIdx]: true }));
  };
  const startDuplicate = (subIdx, q) => {
    setForm({ text: q.text, options: q.options.slice(), correct: q.correct, expl: q.expl });
    setFormMode({ type: "add", subIdx });
    setOpenSubs(s => ({ ...s, [subIdx]: true }));
    flash("ok", "Duplicated into a new question — edit it, then save.");
  };
  const cancelForm = () => { setFormMode(null); setForm(EMPTY_FORM); };

  const submitForm = async () => {
    if (!formMode) return;
    const payload = { ...form, correct: parseInt(form.correct) };
    if (!payload.text.trim() || payload.options.some(o => !o.trim()) || !payload.expl.trim()) {
      flash("err", "Fill in the question, all four options, and an explanation.");
      return;
    }
    setBusy(true);
    const isEdit = formMode.type === "edit";
    const body = {
      catId: editCat.id,
      subIdx: formMode.subIdx,
      num: formMode.num,
      data: payload,
      action: isEdit ? "editQuestion" : "addQuestion",
    };
    const res = await fetch("/api/admin/subjects", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { flash("err", j.error || "Something went wrong."); return; }
    flash("ok", isEdit ? "Question updated." : "Question added.");
    const keepSubIdx = formMode.subIdx;
    cancelForm();
    loadCatQuiet(editCat.id, keepSubIdx);
    refreshCats();
  };

  // like loadCat but keeps the given subtopic open + tab state, for smooth in-place edits
  const loadCatQuiet = async (id, keepSubIdx) => {
    const d = await fetch(`/api/questions?id=${id}`).then(r => r.json());
    setEditCat(d.category);
    if (keepSubIdx !== undefined) setOpenSubs(s => ({ ...s, [keepSubIdx]: true }));
  };

  const requestDeleteQuestion = (subIdx, num) => setConfirmState({ kind: "question", subIdx, num });
  const requestDeleteSubtopic = (subIdx) => setConfirmState({ kind: "subtopic", subIdx });
  const requestDeleteSubject = () => setConfirmState({ kind: "subject" });

  const runConfirm = async () => {
    if (!confirmState) return;
    setConfirmState(s => ({ ...s, busy: true }));
    if (confirmState.kind === "question") {
      const res = await fetch("/api/admin/subjects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catId: editCat.id, subIdx: confirmState.subIdx, num: confirmState.num }),
      });
      const j = await res.json();
      if (!res.ok) { flash("err", j.error || "Delete failed."); setConfirmState(null); return; }
      flash("ok", "Question deleted.");
      loadCatQuiet(editCat.id, confirmState.subIdx);
      refreshCats();
    } else if (confirmState.kind === "subtopic") {
      const res = await fetch("/api/admin/subjects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catId: editCat.id, subIdx: confirmState.subIdx, action: "deleteSubtopic" }),
      });
      const j = await res.json();
      if (!res.ok) { flash("err", j.error || "Delete failed."); setConfirmState(null); return; }
      flash("ok", "Subtopic deleted.");
      loadCat(editCat.id);
      refreshCats();
    } else if (confirmState.kind === "subject") {
      const res = await fetch(`/api/admin/subjects?id=${editCat.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) { flash("err", j.error || "Delete failed."); setConfirmState(null); return; }
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
    const res = await fetch("/api/admin/subjects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateSubject", catId: editCat.id, title: metaForm.title, description: metaForm.description, group: metaForm.group }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { flash("err", j.error || "Update failed."); return; }
    flash("ok", "Subject details saved.");
    loadCat(editCat.id);
    refreshCats();
  };

  const handleCreateSubject = async () => {
    if (!newSubject.title.trim()) { flash("err", "Give the new subject a title."); return; }
    setBusy(true);
    const res = await fetch("/api/admin/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createSubject", title: newSubject.title, description: newSubject.description, group: newSubject.group }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { flash("err", j.error || "Could not create subject."); return; }
    flash("ok", `Created "${j.category.title}".`);
    setNewSubject({ title: "", description: "", group: "civil1" });
    setNewSubjectOpen(false);
    await refreshCats();
    loadCat(j.category.id);
  };

  const handleAddSubtopic = async () => {
    if (!newSubtopicName.trim()) { flash("err", "Give the subtopic a name."); return; }
    setBusy(true);
    const res = await fetch("/api/admin/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addSubtopic", catId: editCat.id, name: newSubtopicName }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { flash("err", j.error || "Could not add subtopic."); return; }
    flash("ok", "Subtopic added.");
    setNewSubtopicName("");
    await loadCat(editCat.id);
    setOpenSubs(s => ({ ...s, [j.subIdx]: true }));
    refreshCats();
  };

  const startRename = (subIdx, currentName) => setRenaming({ subIdx, value: currentName });
  const cancelRename = () => setRenaming(null);
  const submitRename = async () => {
    if (!renaming || !renaming.value.trim()) { flash("err", "Subtopic name can't be empty."); return; }
    setBusy(true);
    const res = await fetch("/api/admin/subjects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "renameSubtopic", catId: editCat.id, subIdx: renaming.subIdx, name: renaming.value }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { flash("err", j.error || "Rename failed."); return; }
    flash("ok", "Subtopic renamed.");
    const keepSubIdx = renaming.subIdx;
    setRenaming(null);
    loadCatQuiet(editCat.id, keepSubIdx);
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
    const res = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: obj, group: importGroup }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { flash("err", j.error || "Import failed."); return; }
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

  if (loading) return <div className="loading-row"><span className="spinner"></span> Loading…</div>;
  if (!user || user.role !== "admin") return <div className="empty-note">Not authorized.</div>;

  return (
    <>
      <div className="app-header">
        <span className="dwg-tag mono">ADMIN PANEL</span>
        <h1 className="serif">Manage Questions</h1>
        <p>Create subjects, organize subtopics, and add, edit or remove questions. Mass-import a subject from a JSON file.</p>
      </div>

      <div className="admin-overview">
        <div className="stat-chip"><div className="num serif">{overview.totalSubjects}</div><div className="lab mono">Subjects</div></div>
        <div className="stat-chip"><div className="num serif">{overview.totalSubtopics}</div><div className="lab mono">Subtopics</div></div>
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
                              <span className="sli-meta">{c.subcats.length} topics · {totalQuestionsOf(c)} Qs</span>
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
                      <span>{GROUP_LABELS[editCat.group] || editCat.group} · {totalQuestionsOf(editCat)} questions · {editCat.subcats.length} subtopics</span>
                    </div>
                    {editCat.description && <p style={{ marginTop: 10, fontFamily: "Spectral, Georgia, serif", fontSize: 14, color: "var(--muted)" }}>{editCat.description}</p>}
                  </div>
                  <button className="btn small secondary" onClick={() => exportSubject(editCat)}>⭳ Export JSON</button>
                </div>

                <div className="admin-tabs">
                  <button className={activeTab === "content" ? "active" : ""} onClick={() => setActiveTab("content")}>Content</button>
                  <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")}>Settings</button>
                </div>
              </div>

              {activeTab === "content" && (
                <div className="admin-panel">
                  <div className="admin-panel-sub" style={{ marginBottom: 10 }}>SUBTOPICS</div>

                  <div className="add-subtopic-row">
                    <input
                      className="mf-input"
                      placeholder="New subtopic name…"
                      value={newSubtopicName}
                      onChange={e => setNewSubtopicName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleAddSubtopic(); }}
                    />
                    <button className="btn small" disabled={busy} onClick={handleAddSubtopic}>{busy ? <span className="spinner"></span> : "+ Add Subtopic"}</button>
                  </div>

                  {editCat.subcats.map((sc, sIdx) => {
                    const isOpen = !!openSubs[sIdx];
                    const isRenaming = renaming && renaming.subIdx === sIdx;
                    const search = (qSearch[sIdx] || "").trim().toLowerCase();
                    const visibleQuestions = search
                      ? sc.questions.filter(q => q.text.toLowerCase().includes(search))
                      : sc.questions;
                    return (
                      <div key={sIdx} className="subtopic-card">
                        <div className="subtopic-head" onClick={() => toggleSub(sIdx)}>
                          <div className="subtopic-head-left">
                            <span style={{ transition: "transform .25s var(--ease-spring)", transform: isOpen ? "rotate(90deg)" : "none", color: "var(--muted)", fontSize: 11, display: "inline-block" }}>▶</span>
                            <h4 style={{ margin: 0, fontSize: 14.5, textTransform: "uppercase", color: "var(--ink-deep)" }}>{sc.name}</h4>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{sc.questions.length} questions</span>
                            <button className="icon-action" onClick={(e) => { e.stopPropagation(); startRename(sIdx, sc.name); setOpenSubs(s => ({ ...s, [sIdx]: true })); }}>Rename</button>
                            <button className="icon-action danger" onClick={(e) => { e.stopPropagation(); requestDeleteSubtopic(sIdx); }}>Delete</button>
                          </div>
                        </div>
                        {isOpen && (
                          <div className="subtopic-body">
                            {isRenaming && (
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
                            )}

                            <div className="btn-row" style={{ marginBottom: 12, justifyContent: "space-between" }}>
                              <button className="btn small" onClick={() => startAdd(sIdx)}>+ Add Question</button>
                              {sc.questions.length > 4 && (
                                <input
                                  className="mf-input"
                                  style={{ maxWidth: 220, padding: "7px 10px", fontSize: 12.5 }}
                                  placeholder="Filter questions…"
                                  value={qSearch[sIdx] || ""}
                                  onChange={e => setQSearch(s => ({ ...s, [sIdx]: e.target.value }))}
                                />
                              )}
                            </div>

                            {formMode && formMode.subIdx === sIdx && (
                              <QuestionForm
                                form={form}
                                setForm={setForm}
                                mode={formMode.type}
                                busy={busy}
                                onCancel={cancelForm}
                                onSubmit={submitForm}
                              />
                            )}

                            {sc.questions.length === 0 ? (
                              <div className="empty-note" style={{ padding: "10px 0" }}>No questions in this subtopic yet.</div>
                            ) : visibleQuestions.length === 0 ? (
                              <div className="empty-note" style={{ padding: "10px 0" }}>No questions match "{qSearch[sIdx]}".</div>
                            ) : visibleQuestions.map(q => (
                              <div key={q.num} className="question-row">
                                <div className="question-row-text"><span className="question-row-num">#{q.num}</span>{q.text.slice(0, 140)}{q.text.length > 140 ? "…" : ""}</div>
                                <div className="question-row-actions">
                                  <button className="icon-action" onClick={() => startEdit(sIdx, q)}>Edit</button>
                                  <button className="icon-action" onClick={() => startDuplicate(sIdx, q)}>Duplicate</button>
                                  <button className="icon-action danger" onClick={() => requestDeleteQuestion(sIdx, q.num)}>Delete</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
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

                  <div className="danger-zone">
                    <div className="danger-zone-title">Danger Zone</div>
                    <p>Permanently deletes "{editCat.title}" and all {totalQuestionsOf(editCat)} of its questions across {editCat.subcats.length} subtopics. This can't be undone.</p>
                    <button className="btn small danger" onClick={requestDeleteSubject}>Delete Subject</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmState}
        title={
          confirmState?.kind === "subject" ? "Delete subject?" :
          confirmState?.kind === "subtopic" ? "Delete subtopic?" : "Delete question?"
        }
        message={
          confirmState?.kind === "subject" ? `This permanently removes "${editCat?.title}" and every question in it. This can't be undone.` :
          confirmState?.kind === "subtopic" ? "This permanently removes the subtopic and all questions inside it. This can't be undone." :
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

function QuestionForm({ form, setForm, mode, busy, onCancel, onSubmit }){
  return (
    <div className="form-panel">
      <div className="form-panel-head">
        <span className="fp-title">{mode === "edit" ? "Edit Question" : "New Question"}</span>
      </div>
      <div className="mf-field">
        <label className="mf-label">Question text</label>
        <textarea className="mf-textarea" rows={2} placeholder="Question text" value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} />
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
      <div className="mf-hint">Tip: press Esc to cancel this form.</div>
      <div className="btn-row">
        <button className="btn small" disabled={busy} onClick={onSubmit}>{busy ? <span className="spinner"></span> : (mode === "edit" ? "Save Changes" : "Add Question")}</button>
        <button className="btn small ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
