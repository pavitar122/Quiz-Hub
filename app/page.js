"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import Counter from "@/components/Counter";
import { monogram } from "@/lib/badge";
import { listCheckpoints } from "@/lib/checkpoint";

export default function HomePage(){
  const [cats,setCats]=useState([]);
  const [groups,setGroups]=useState([]);
  const [activeApp,setActiveApp]=useState("civil1");
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const [progress,setProgress]=useState(null);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState(null);
  const { user } = useAuth();
  const searchRef = useRef(null);

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

  const loadMeta=()=>{
    setLoading(true);
    setLoadError(null);
    // Lightweight metadata only (titles/descriptions/counts) — the homepage
    // never needs full question text, and this keeps the initial load fast.
    fetch("/api/questions?meta=1")
      .then(r=>{ if(!r.ok) throw new Error("Could not load subjects"); return r.json(); })
      .then(d=>{
        setCats(d.categories||[]);
        setGroups(d.groups||[]);
        setLoading(false);
      })
      .catch(e=>{ setLoadError(e.message||"Something went wrong while loading."); setLoading(false); });
  };
  useEffect(loadMeta,[]);
  useEffect(()=>{
    if(user) fetch("/api/progress").then(r=>r.json()).then(d=>setProgress(d.progress)).catch(()=>{});
    else setProgress(null);
  },[user]);

  const groupCats = cats.filter(c=>c.group===activeApp);
  const q=search.trim().toLowerCase();
  const filtered = groupCats.filter(cat=>{
    if(q && !(cat.title.toLowerCase().includes(q) || cat.description.toLowerCase().includes(q))) return false;
    if(filter!=="all"){
      const st=categoryStatus(cat,progress);
      if(st!==filter) return false;
    }
    return true;
  });

  const counts={all:groupCats.length,new:0,progress:0,done:0};
  groupCats.forEach(cat=>counts[categoryStatus(cat,progress)]++);

  const activeMeta=groups.find(g=>g.id===activeApp) || groups[0];
  const totalQGroup=groupCats.reduce((a,c)=>a+(c.subcats?.reduce((s,sc)=>s+sc.count,0)||0),0);
  const acc = overallAccuracy(progress);
  const weak = weakest(progress,cats.filter(c=>c.group===activeApp));

  // unfinished practice sessions → "Continue practicing" dashboard
  const checkpoints = loading ? [] : listCheckpoints(user, progress)
    .map(({catId,checkpoint})=>({ catId, checkpoint, cat: cats.find(c=>c.id===catId) }))
    .filter((c)=>c.cat)
    .sort((a,b)=>(b.checkpoint.updatedAt||0)-(a.checkpoint.updatedAt||0))
    .slice(0,6);

  if(loadError){
    return (
      <div className="error-card">
        <span className="dwg-tag mono">LOADING FAILED</span>
        <h2>Couldn&apos;t load Quiz Hub</h2>
        <p>{loadError} Check your connection and try again.</p>
        <div className="btn-row" style={{justifyContent:"center"}}>
          <button className="btn" onClick={loadMeta}>↻ Try again</button>
        </div>
      </div>
    );
  }

  if(loading){
    return (
      <>
        <div className="app-header">
          <span className="dwg-tag mono skeleton skeleton-line w-40" style={{display:"inline-block",height:14}}>&nbsp;</span>
          <div className="skeleton skeleton-line w-60" style={{height:34,marginTop:10}}></div>
        </div>
        <div className="skeleton-grid" style={{marginTop:24}}>
          {Array.from({length:6}).map((_,i)=><div key={i} className="skeleton skeleton-card" style={{animationDelay:(i*0.04)+"s"}}></div>)}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="app-header">
        <span className="dwg-tag mono">QUIZ HUB · CIVIL ENGINEERING PRACTICE</span>
        <h1 className="serif">{user ? `Welcome back${user.name ? ", " + user.name : ""}` : "Civil Engineering Objective Practice"}</h1>
        <p>Pick a question bank below. {user ? "Your progress and practice checkpoints sync to your account." : "Login to sync progress across devices — or practice as a guest."}</p>
      </div>
      <div className="app-switcher">
        {groups.map(g=>{
          const gCats=cats.filter(c=>c.group===g.id);
          const gTotal=gCats.reduce((a,c)=>a+c.subcats.reduce((s,sc)=>s+sc.count,0),0);
          const todayStr=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"});
          const isToday=progress?.dailyTestCorrect?.date===todayStr;
          const daily=isToday ? (progress?.dailyTestCorrect?.counts?.[g.id]||0) : 0;
          return (
            <button key={g.id} className={`app-tab ${activeApp===g.id?"active":""}`} onClick={()=>{setActiveApp(g.id);}}>
              <span className="mono-badge md app-tab-icon">{g.code}</span>
              <span className="app-tab-text">
                <span className="app-tab-label">{g.label}</span>
                <span className="app-tab-meta">{gCats.length} subjects · {gTotal} Qs</span>
                <span className="daily-count mono" title="Correct answers today in Test mode — resets at midnight IST">
                  <span className={`daily-dot ${daily>0?"on":""}`}></span>
                  Today: {user ? <Counter value={daily} /> : "—"} ✓
                </span>
              </span>
              <span className={`daily-pill mono ${activeApp===g.id?"active":""} ${daily>0?"has-count":""}`} aria-hidden>{user ? daily : "—"}</span>
            </button>
          );
        })}
      </div>

      {activeMeta && (
        <div className="app-header" style={{margin:"22px 0 20px"}}>
          <span className="dwg-tag mono">{activeMeta.code} · {activeMeta.label.toUpperCase()}</span>
          <p style={{marginTop:2}}>{activeMeta.blurb}</p>
        </div>
      )}

      <div className="stat-strip">
        <div className="stat-chip"><div className="num serif"><Counter value={totalQGroup} /></div><div className="lab mono">Questions In This Bank</div></div>
        <div className="stat-chip"><div className="num serif">{acc===null?"—":<Counter value={acc} suffix="%" />}</div><div className="lab mono">Overall Accuracy</div></div>
        <div className="stat-chip"><div className="num serif"><Counter value={progress?.stats?.bestStreak||0} /></div><div className="lab mono">Best Streak</div></div>
        <div className="stat-chip"><div className="num serif"><Counter value={progress?.stats?.sessionsCompleted||0} /></div><div className="lab mono">Sessions Done</div></div>
      </div>

      {checkpoints.length>0 && (
        <div className="checkpoint-dash">
          <span className="dwg-tag mono">CONTINUE PRACTICING</span>
          <div className="checkpoint-list">
            {checkpoints.map(({catId,checkpoint:cp})=>{
              const done=cp.completedCount||0;
              const total=cp.totalUnique||0;
              const pct=total>0?Math.round((done/total)*100):0;
              const label=catLabel(cp);
              return (
                <div key={catId} className="checkpoint-item">
                  <div>
                    <div className="ci-title">{cats.find(c=>c.id===catId)?.title || catId}</div>
                    <div className="ci-meta">
                      <span>{label} · question {Math.min(total, done+1)} of {total}</span>
                      <span>Mastered {cp.mastered||0} · {timeAgo(cp.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="resume-progress">
                    <div className="bar"><div className="fill" style={{width:pct+"%"}}></div></div>
                    <span className="mono" style={{fontSize:11,color:"var(--muted)"}}>{pct}%</span>
                  </div>
                  <div className="ci-actions">
                    <Link href={`/quiz/${catId}?mode=practice&type=${cp.type}${cp.idx!=null?`&idx=${cp.idx}`:""}&resume=1`} className="btn small">▶ Resume</Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {weak && <div className="empty-note" style={{textAlign:"left",marginBottom:18}}><span className="dwg-tag mono" style={{display:"inline",marginBottom:0}}>FOCUS</span> — &quot;{weak.name}&quot; ({weak.catTitle}) — best {weak.pct}%.</div>}

      <div className="searchbar">
        <span className="icon mono">SEARCH</span>
        <input ref={searchRef} type="text" placeholder="Filter subjects... (press / to focus)" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="filter-chips mono">
        <button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>All ({counts.all})</button>
        <button className={filter==="new"?"active":""} onClick={()=>setFilter("new")}>Not Started ({counts.new})</button>
        <button className={filter==="progress"?"active":""} onClick={()=>setFilter("progress")}>In Progress ({counts.progress})</button>
        <button className={filter==="done"?"active":""} onClick={()=>setFilter("done")}>Attempted All ({counts.done})</button>
      </div>

      <div className="category-grid">
        {filtered.length===0 ? <div className="empty-note">No subjects match your filters.</div> :
          filtered.map(cat=>{
            const total=cat.subcats.reduce((a,s)=>a+s.count,0);
            const best=(progress?.bestScores?.[cat.id]||{})["FULL"];
            const attempted=cat.subcats.filter((_,i)=>progress?.bestScores?.[cat.id]?.[String(i)]).length;
            const pct=Math.round((attempted/cat.subcats.length)*100);
            return (
              <Link key={cat.id} href={`/subject/${cat.id}`} style={{textDecoration:"none"}}>
                <div className="category-card">
                  <span className="mono-badge sm cat-icon">{monogram(cat.title)}</span>
                  <h2 className="serif">{cat.title}</h2>
                  <p>{cat.description}</p>
                  <div className="cat-progress-row"><span>{cat.subcats.length} topics · {total} Qs</span><span>{best ? `Last: ${best.pct}%` : "Not started"}</span></div>
                  <div className="cat-progress-bar"><div className="cat-progress-fill" style={{width:pct+"%"}}></div></div>
                </div>
              </Link>
            );
          })}
      </div>
    </>
  );
}

function catLabel(checkpoint){
  const map={full:"Full subject", random:"Random 30", bookmarked:"Bookmarked", missed:"Past misses", sub:"Chapter"};
  let l=map[checkpoint.type]||"Practice";
  if(checkpoint.type==="sub" && checkpoint.idx!=null) l=`Chapter ${Number(checkpoint.idx)+1}`;
  return l;
}
function timeAgo(ts){
  if(!ts) return "just now";
  const s=Math.max(1,Math.floor((Date.now()-Number(ts))/1000));
  if(s<60) return "just now";
  const m=Math.floor(s/60);
  if(m<60) return `${m} min ago`;
  const h=Math.floor(m/60);
  if(h<24) return `${h} hr ago`;
  const d=Math.floor(h/24);
  return `${d} day${d>1?"s":""} ago`;
}

function categoryStatus(cat, progress){
  if(!progress) return "new";
  const scores=progress.bestScores?.[cat.id]||{};
  const attempted=cat.subcats.filter((_,i)=>scores[String(i)]).length;
  if(attempted===0) return "new";
  if(attempted>=cat.subcats.length) return "done";
  return "progress";
}
function overallAccuracy(p){
  if(!p || !p.stats || p.stats.totalAnswered===0) return null;
  return Math.round((p.stats.totalCorrect/p.stats.totalAnswered)*100);
}
function weakest(progress,cats){
  if(!progress) return null;
  let worst=null;
  cats.forEach(cat=>{
    const scores=progress.bestScores?.[cat.id]||{};
    cat.subcats.forEach((sc,i)=>{
      const s=scores[String(i)];
      if(s && (!worst || s.pct<worst.pct)) worst={name:sc.name,pct:s.pct,catTitle:cat.title};
    });
  });
  return worst;
}
