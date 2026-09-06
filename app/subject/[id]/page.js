"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { monogram } from "@/lib/badge";

export default function SubjectPage(){
  const { id } = useParams();
  const [cat,setCat]=useState(null);
  const [mode,setMode]=useState("test");
  const [search,setSearch]=useState("");
  const [progress,setProgress]=useState(null);
  const { user } = useAuth();
  const searchRef = useRef(null);
  useEffect(()=>{
    fetch(`/api/questions?id=${id}`).then(r=>r.json()).then(d=>setCat(d.category));
  },[id]);
  useEffect(()=>{
    if(user) fetch("/api/progress").then(r=>r.json()).then(d=>setProgress(d.progress));
  },[user]);
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

  return (
    <>
      <div className="top-bar">
        <Link href="/" className="back-link">← All Categories</Link>
        {user?.role==="admin" && <Link href="/admin" className="back-link">Admin Panel</Link>}
      </div>
      <div className="app-header">
        <span className="dwg-tag mono">{monogram(cat.title)} · CATEGORY OVERVIEW</span>
        <h1 className="serif">{cat.title}</h1>
        <p>{cat.description}</p>
      </div>
      <div className="mode-toggle mono">
        <button className={mode==="test"?"active":""} onClick={()=>setMode("test")}>Test Mode</button>
        <button className={mode==="practice"?"active":""} onClick={()=>setMode("practice")}>Practice Mode</button>
      </div>
      <Link href={`/quiz/${cat.id}?mode=${mode}&type=full`} style={{textDecoration:"none"}}>
        <div className="dwg-card full-run-card">
          <span className="dwg-tag mono">DWG-00 · FULL CATEGORY RUN</span>
          <h2 className="serif">Full Category Run — All {totalQ} Questions</h2>
          <div className="meta mono">{cat.subcats.length} subtopics{fullBest ? ` · Last: ${fullBest.correct}/${fullBest.total} (${fullBest.pct}%)`:""}{fullAttempts>0 ? ` · Attempted ${fullAttempts}×`:""}</div>
        </div>
      </Link>
      <Link href={`/quiz/${cat.id}?mode=${mode}&type=random`} style={{textDecoration:"none"}}>
        <div className="dwg-card full-run-card alt">
          <span className="dwg-tag mono">DWG-R0 · RANDOM DRAW</span>
          <h2 className="serif">Random 30 Questions</h2>
          <div className="meta mono">Shuffled mix{randomBest ? ` · Last: ${randomBest.correct}/${randomBest.total} (${randomBest.pct}%)`:""}{randomAttempts>0 ? ` · Attempted ${randomAttempts}×`:""}</div>
        </div>
      </Link>
      <div className="btn-row" style={{marginBottom:26}}>
        <Link href={`/quiz/${cat.id}?mode=${mode}&type=bookmarked`} className={`btn secondary ${bookCount===0?"":""}`} style={{opacity:bookCount===0?0.4:1, pointerEvents:bookCount===0?"none":"auto", textDecoration:"none", display:"inline-block"}}>★ Review Bookmarked ({bookCount})</Link>
        <Link href={`/quiz/${cat.id}?mode=${mode}&type=missed`} className="btn secondary" style={{opacity:missCount===0?0.4:1, pointerEvents:missCount===0?"none":"auto", textDecoration:"none", display:"inline-block"}}>↻ Smart Review — Past Misses ({missCount})</Link>
      </div>
      <div className="searchbar">
        <span className="icon mono">SEARCH</span>
        <input ref={searchRef} type="text" placeholder="Filter subtopics... (press / to focus)" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="subcat-grid">
        {filtered.length===0 ? <div className="empty-note">No subtopics match.</div> :
          filtered.map(({sc,i})=>{
            const best=(progress?.bestScores?.[cat.id]||{})[String(i)];
            const attempts=(progress?.attemptCounts?.[cat.id]||{})[String(i)]||0;
            const pct=best?best.pct:0;
            return (
              <Link key={i} href={`/quiz/${cat.id}?mode=${mode}&type=sub&idx=${i}`} style={{textDecoration:"none"}}>
                <div className="subcat-card">
                  <span className="dwg-tag mono">DWG-0{i+1}</span>
                  <h3 className="serif">{sc.name}</h3>
                  <div className="row"><span>{sc.questions.length} questions</span>{best ? <span className="best">{best.correct}/{best.total} ({best.pct}%)</span> : <span>Not attempted</span>}</div>
                  <div className="mini-bar"><div className="mini-bar-fill" style={{width:pct+"%"}}></div></div>
                  {attempts>0 && <div className="attempt-count mono">Tested {attempts}×</div>}
                </div>
              </Link>
            );
          })}
      </div>
    </>
  );
}
