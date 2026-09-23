"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { monogram } from "@/lib/badge";
import { readCheckpoint, removeCheckpoint, isSaneCheckpoint } from "@/lib/checkpoint";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function SubjectPage(){
  const { id } = useParams();
  const [cat,setCat]=useState(null);
  const [loadError,setLoadError]=useState(null);
  const [mode,setMode]=useState("test");
  const [search,setSearch]=useState("");
  const [progress,setProgress]=useState(null);
  const [checkpoint,setCheckpoint]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const { user } = useAuth();
  const searchRef = useRef(null);

  useEffect(()=>{
    setLoadError(null);
    fetch(`/api/questions?id=${id}`)
      .then(r=>{ if(!r.ok) throw new Error("Could not load this subject"); return r.json(); })
      .then(d=>{ if(!d.category) throw new Error("Subject not found."); setCat(d.category); })
      .catch(e=>setLoadError(e.message||"Something went wrong while loading."));
  },[id]);
  useEffect(()=>{
    if(user) fetch("/api/progress").then(r=>r.json()).then(d=>setProgress(d.progress)).catch(()=>{});
    else setProgress(null);
  },[user]);
  // practice checkpoint for this chapter (server for users, localStorage for guests)
  useEffect(()=>{
    const cp=readCheckpoint(user, id, progress);
    setCheckpoint(isSaneCheckpoint(cp)?cp:null);
  },[user,progress,id]);
  useEffect(()=>{
    const onKey=(e)=>{
      if(e.key==="/" && document.activeElement?.tagName!=="INPUT" && document.activeElement?.tagName!=="TEXTAREA"){
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[]);

  if(loadError) return (
    <>
      <div className="top-bar"><Link href="/" className="back-link">← All subjects</Link></div>
      <div className="error-card">
        <span className="dwg-tag mono">LOADING FAILED</span>
        <h2>Couldn&apos;t load this subject</h2>
        <p>{loadError} Check your connection and try again.</p>
        <div className="btn-row" style={{justifyContent:"center"}}>
          <button className="btn" onClick={()=>{setLoadError(null); setCat(null); fetch(`/api/questions?id=${id}`,{cache:"reload"}).then(r=>r.json()).then(d=>{ if(d.category) setCat(d.category); else setLoadError("Subject not found."); }).catch(()=>setLoadError("Could not reach the server."));}}>↻ Try again</button>
          <Link href="/" className="btn secondary">Home</Link>
        </div>
      </div>
    </>
  );

  if(!cat) return (
    <>
      <div className="skeleton skeleton-line w-40" style={{height:12}}></div>
      <div className="app-header">
        <div className="skeleton skeleton-line w-40" style={{height:14,marginTop:14}}></div>
        <div className="skeleton skeleton-line w-60" style={{height:32,marginTop:10}}></div>
      </div>
      <div className="skeleton skeleton-card" style={{height:96,marginBottom:14}}></div>
      <div className="skeleton skeleton-card" style={{height:96,marginBottom:20}}></div>
      <div className="skeleton-grid">
        {Array.from({length:4}).map((_,i)=><div key={i} className="skeleton skeleton-card" style={{animationDelay:(i*0.04)+"s"}}></div>)}
      </div>
    </>
  );
  const totalQ=cat.subcats.reduce((a,s)=>a+s.questions.length,0);
  const q=search.trim().toLowerCase();
  const filtered=cat.subcats.map((sc,i)=>({sc,i})).filter(({sc})=> !q || sc.name.toLowerCase().includes(q) || sc.questions.some(qq=>qq.text.toLowerCase().includes(q)));
  const bookCount=(progress?.bookmarks?.[cat.id]||[]).length;
  const missCount=Object.values(progress?.missCounts?.[cat.id]||{}).filter(v=>v>0).length;
  const fullBest=(progress?.bestScores?.[cat.id]||{})["FULL"];
  const randomBest=(progress?.bestScores?.[cat.id]||{})["RANDOM"];
  const fullAttempts=(progress?.attemptCounts?.[cat.id]||{})["FULL"]||0;
  const randomAttempts=(progress?.attemptCounts?.[cat.id]||{})["RANDOM"]||0;

  const cpDone=checkpoint?.completedCount||0;
  const cpTotal=checkpoint?.totalUnique||0;
  const cpPct=cpTotal>0?Math.round((cpDone/cpTotal)*100):0;
  const cpResumeHref=`/quiz/${cat.id}?mode=practice&type=${checkpoint?.type||"full"}${checkpoint?.idx!=null?`&idx=${checkpoint.idx}`:""}&resume=1`;

  return (
    <>
      <div className="top-bar">
        <Link href="/" className="back-link">← All subjects</Link>
        {user?.role==="admin" && <Link href="/admin" className="back-link">Admin Panel</Link>}
      </div>
      <div className="app-header">
        <span className="dwg-tag mono">{monogram(cat.title)} · SUBJECT OVERVIEW</span>
        <h1 className="serif">{cat.title}</h1>
        <p>{cat.description}</p>
      </div>

      {checkpoint && (
        <div className="resume-card">
          <span className="dwg-tag mono">CHECKPOINT · PRACTICE</span>
          <h2 className="resume-title">Continue where you left off?</h2>
          <p className="resume-sub">You were on question {Math.min(cpTotal, cpDone+1)} of {cpTotal} in <b>{cat.title}</b>.</p>
          <div className="resume-progress">
            <span className="mono" style={{fontSize:12,color:"var(--muted)"}}>{cpDone}/{cpTotal}</span>
            <div className="bar"><div className="fill" style={{width:cpPct+"%"}}></div></div>
            <span className="mono" style={{fontSize:12,color:"var(--muted)"}}>{cpPct}%</span>
          </div>
          <div className="resume-actions" style={{marginTop:14}}>
            <Link href={cpResumeHref} className="btn">▶ Resume practice</Link>
            <Link href={`/quiz/${cat.id}?mode=practice&type=${checkpoint?.type||"full"}${checkpoint?.idx!=null?`&idx=${checkpoint.idx}`:""}`} className="btn secondary" onClick={()=>removeCheckpoint(user, id)}>↺ Start over</Link>
            <button className="btn ghost" onClick={()=>setConfirmDelete(true)} title="Delete checkpoint">Delete</button>
          </div>
        </div>
      )}

      <div className="mode-toggle mono">
        <button className={mode==="test"?"active":""} onClick={()=>setMode("test")}>Test Mode</button>
        <button className={mode==="practice"?"active":""} onClick={()=>setMode("practice")}>Practice Mode</button>
        <button className={mode==="listen"?"active":""} onClick={()=>setMode("listen")}>🎧 Listen &amp; Learn</button>
      </div>
      {mode==="listen" && (
        <div className="dwg-card listen-intro-card" style={{borderLeft:"4px solid var(--accent)", marginBottom:18}}>
          <span className="dwg-tag mono">LISTEN &amp; LEARN — HANDS-FREE</span>
          <p style={{margin:"6px 0 8px", fontSize:15.5, lineHeight:1.55}}>Study while walking, travelling or resting. Each question is spoken aloud — Question → Options → Answer → Explanation — then it auto-advances. You can turn off spoken options on the player to hear only Question → Answer → Explanation. Pause, replay, change speed or skip anytime.</p>
          <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>Tip: plug in earphones and press Play on the next screen. Cloud voices stay the same on every device.</div>
        </div>
      )}
      <Link href={`/quiz/${cat.id}?mode=${mode}&type=full`} style={{textDecoration:"none"}}>
        <div className="dwg-card full-run-card">
          <span className="dwg-tag mono">FULL RUN</span>
          <h2 className="serif">Full Subject Run — All {totalQ} Questions</h2>
          <div className="meta mono">{cat.subcats.length} chapters{fullBest ? ` · Last: ${fullBest.correct}/${fullBest.total} (${fullBest.pct}%)`:""}{fullAttempts>0 ? ` · Attempted ${fullAttempts}×`:""}</div>
        </div>
      </Link>
      <Link href={`/quiz/${cat.id}?mode=${mode}&type=random`} style={{textDecoration:"none"}}>
        <div className="dwg-card full-run-card alt">
          <span className="dwg-tag mono">RANDOM DRAW</span>
          <h2 className="serif">Random 30 Questions</h2>
          <div className="meta mono">Shuffled mix{randomBest ? ` · Last: ${randomBest.correct}/${randomBest.total} (${randomBest.pct}%)`:""}{randomAttempts>0 ? ` · Attempted ${randomAttempts}×`:""}</div>
        </div>
      </Link>
      <div className="btn-row" style={{marginBottom:26}}>
        <Link href={`/quiz/${cat.id}?mode=${mode}&type=bookmarked`} className="btn secondary" style={{opacity:bookCount===0?0.4:1, pointerEvents:bookCount===0?"none":"auto", textDecoration:"none", display:"inline-flex"}}>★ Review Bookmarked ({bookCount})</Link>
        <Link href={`/quiz/${cat.id}?mode=${mode}&type=missed`} className="btn secondary" style={{opacity:missCount===0?0.4:1, pointerEvents:missCount===0?"none":"auto", textDecoration:"none", display:"inline-flex"}}>↻ Smart Review — Past Misses ({missCount})</Link>
      </div>
      <div className="searchbar">
        <span className="icon mono">SEARCH</span>
        <input ref={searchRef} type="text" placeholder="Filter chapters... (press / to focus)" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="subcat-grid">
        {filtered.length===0 ? <div className="empty-note">No chapters match.</div> :
          filtered.map(({sc,i})=>{
            const best=(progress?.bestScores?.[cat.id]||{})[String(i)];
            const attempts=(progress?.attemptCounts?.[cat.id]||{})[String(i)]||0;
            const pct=best?best.pct:0;
            return (
              <Link key={i} href={`/quiz/${cat.id}?mode=${mode}&type=sub&idx=${i}`} style={{textDecoration:"none"}}>
                <div className="subcat-card">
                  <div className="subcat-card-head">
                    <span className="dwg-tag mono" style={{marginBottom:0}}>CH-{String(i+1).padStart(2,"0")}</span>
                    <span className="attempt-count mono">Tested {attempts}×</span>
                  </div>
                  <h3 className="serif">{sc.name}</h3>
                  <div className="row"><span>{sc.questions.length} questions</span>{best ? <span className="best">{best.correct}/{best.total} ({best.pct}%)</span> : <span>Not attempted</span>}</div>
                  <div className="mini-bar"><div className="mini-bar-fill" style={{width:pct+"%"}}></div></div>
                </div>
              </Link>
            );
          })}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this checkpoint?"
        message="Your saved practice position for this subject will be removed. You can always start a fresh session."
        confirmLabel="Delete"
        danger
        onConfirm={()=>{ removeCheckpoint(user, id); setCheckpoint(null); setConfirmDelete(false); }}
        onCancel={()=>setConfirmDelete(false)}
      />
    </>
  );
}
