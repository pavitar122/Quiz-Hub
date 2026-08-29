"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

const EMPTY_FORM = { text: "", options: ["", "", "", ""], correct: 0, expl: "" };
const GROUP_LABELS = { civil1: "Civil 1", civil2: "Civil 2", nontechnical: "Non-Technical" };

export default function AdminPage(){
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cats, setCats] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editCat, setEditCat] = useState(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [openSubs, setOpenSubs] = useState({}); // { [subIdx]: bool }

  const [formMode, setFormMode] = useState(null); // { type: 'add'|'edit', subIdx, num? }
  const [form, setForm] = useState(EMPTY_FORM);

  const [metaEditing, setMetaEditing] = useState(false);
  const [metaForm, setMetaForm] = useState({ title: "", description: "", group: "civil1" });

  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ title: "", description: "", group: "civil1" });

  const [importFile, setImportFile] = useState(null);
  const [importGroup, setImportGroup] = useState("civil1");

  const [msg, setMsg] = useState(null); // { type:'ok'|'err', text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) { router.push("/"); return; }
    refreshCats();
  }, [user, loading]);

  const flash = (type, text) => setMsg({ type, text });

  const refreshCats = () => fetch("/api/questions").then(r => r.json()).then(d => setCats(d.categories || []));

  const loadCat = async (id) => {
    setSelectedId(id);
    setFormMode(null);
    setMetaEditing(false);
    setOpenSubs({});
    const d = await fetch(`/api/questions?id=${id}`).then(r => r.json());
    setEditCat(d.category);
    setMetaForm({ title: d.category?.title || "", description: d.category?.description || "", group: d.category?.group || "civil1" });
  };

  const toggleSub = (i) => setOpenSubs(s => ({ ...s, [i]: !s[i] }));

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
    cancelForm();
    loadCat(editCat.id);
    refreshCats();
  };

  const handleDelete = async (subIdx, num) => {
    if (!confirm("Delete this question? This can't be undone.")) return;
    const res = await fetch("/api/admin/subjects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catId: editCat.id, subIdx, num }),
    });
    const j = await res.json();
    if (!res.ok) { flash("err", j.error || "Delete failed."); return; }
    flash("ok", "Question deleted.");
    loadCat(editCat.id);
    refreshCats();
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
    setMetaEditing(false);
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

  const handleDeleteSubject = async () => {
    if (!editCat) return;
    if (!confirm(`Permanently delete "${editCat.title}" and all of its questions? This can't be undone.`)) return;
    const res = await fetch(`/api/admin/subjects?id=${editCat.id}`, { method: "DELETE" });
    const j = await res.json();
    if (!res.ok) { flash("err", j.error || "Delete failed."); return; }
    flash("ok", "Subject deleted.");
    setSelectedId(null);
    setEditCat(null);
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

  if (loading) return <div className="loading-row"><span className="spinner"></span> Loading…</div>;
  if (!user || user.role !== "admin") return <div className="empty-note">Not authorized.</div>;

  const totalQuestions = (cat) => cat.subcats.reduce((a, s) => a + s.questions.length, 0);

  return (
    <>
      <div className="app-header">
        <span className="dwg-tag mono">ADMIN PANEL</span>
        <h1 className="serif">Manage Questions</h1>
        <p>Create subjects, organize subtopics, and add, edit or remove questions. Mass-import a subject from a JSON file.</p>
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
            <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>🔍</span>
            <input placeholder="Search subjects…" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} />
          </div>

          <div className="subject-list">
            {filteredCats.length === 0 && <div className="empty-note" style={{ padding: "16px 0" }}>No subjects found.</div>}
            {filteredCats.map(c => (
              <button key={c.id} className={`subject-list-item ${selectedId === c.id ? "active" : ""}`} onClick={() => loadCat(c.id)}>
                <span className="sli-icon">{c.icon}</span>
                <span className="sli-text">
                  <span className="sli-title">{c.title}</span>
                  <span className="sli-meta">{c.subcats.length} topics · {totalQuestions(c)} Qs</span>
                </span>
              </button>
            ))}
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
                    {!metaEditing ? (
                      <>
                        <h2 className="admin-panel-title serif">{editCat.title}</h2>
                        <div className="admin-panel-sub">#{editCat.id} · {GROUP_LABELS[editCat.group] || editCat.group} · {totalQuestions(editCat)} questions</div>
                        {editCat.description && <p style={{ marginTop: 10, fontFamily: "Spectral, Georgia, serif", fontSize: 14, color: "var(--muted)" }}>{editCat.description}</p>}
                      </>
                    ) : (
                      <div className="subject-meta-grid" style={{ minWidth: 320 }}>
                        <div className="mf-field" style={{ marginBottom: 10 }}>
                          <label className="mf-label">Title</label>
                          <input className="mf-input" value={metaForm.title} onChange={e => setMetaForm({ ...metaForm, title: e.target.value })} />
                        </div>
                        <div className="mf-field" style={{ marginBottom: 10 }}>
                          <label className="mf-label">App / group</label>
                          <select className="mf-select" value={metaForm.group} onChange={e => setMetaForm({ ...metaForm, group: e.target.value })}>
                            <option value="civil1">Civil 1</option>
                            <option value="civil2">Civil 2</option>
                            <option value="nontechnical">Non-Technical</option>
                          </select>
                        </div>
                        <div className="mf-field" style={{ gridColumn: "1 / -1", marginBottom: 4 }}>
                          <label className="mf-label">Description</label>
                          <input className="mf-input" value={metaForm.description} onChange={e => setMetaForm({ ...metaForm, description: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="btn-row">
                    {!metaEditing ? (
                      <>
                        <button className="btn small secondary" onClick={() => setMetaEditing(true)}>Edit Details</button>
                        <button className="btn small danger" onClick={handleDeleteSubject}>Delete Subject</button>
                      </>
                    ) : (
                      <>
                        <button className="btn small" disabled={busy} onClick={saveSubjectMeta}>{busy ? <span className="spinner"></span> : "Save"}</button>
                        <button className="btn small ghost" onClick={() => { setMetaEditing(false); setMetaForm({ title: editCat.title, description: editCat.description, group: editCat.group }); }}>Cancel</button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="admin-panel">
                <div className="admin-panel-sub" style={{ marginBottom: 4 }}>SUBTOPICS</div>
                {editCat.subcats.map((sc, sIdx) => {
                  const isOpen = !!openSubs[sIdx];
                  return (
                    <div key={sIdx}>
                      <div className={`section-toggle ${isOpen ? "open" : ""}`} onClick={() => toggleSub(sIdx)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="chevron">▶</span>
                          <h4>{sc.name}</h4>
                        </div>
                        <span className="st-meta">{sc.questions.length} questions</span>
                      </div>
                      {isOpen && (
                        <div className="section-body">
                          <div className="btn-row" style={{ marginBottom: 12 }}>
                            <button className="btn small" onClick={(e) => { e.stopPropagation(); startAdd(sIdx); }}>+ Add Question</button>
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
                          ) : sc.questions.map(q => (
                            <div key={q.num} className="question-row">
                              <div className="question-row-text"><span className="question-row-num">#{q.num}</span>{q.text.slice(0, 140)}{q.text.length > 140 ? "…" : ""}</div>
                              <div className="question-row-actions">
                                <button className="icon-action" onClick={() => startEdit(sIdx, q)}>Edit</button>
                                <button className="icon-action danger" onClick={() => handleDelete(sIdx, q.num)}>Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {sIdx < editCat.subcats.length - 1 && <hr className="admin-divider" />}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
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
      <div className="btn-row">
        <button className="btn small" disabled={busy} onClick={onSubmit}>{busy ? <span className="spinner"></span> : (mode === "edit" ? "Save Changes" : "Add Question")}</button>
        <button className="btn small ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
